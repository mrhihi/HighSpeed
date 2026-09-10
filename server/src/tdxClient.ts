import "dotenv/config";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const TDX_TOKEN_URL =
  "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";
const TDX_API_BASE = "https://tdx.transportdata.tw/api/basic";

const DEFAULT_MAX_REQUESTS_PER_SECOND = 50;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 20;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 5000;
const RATE_LIMIT_COOLDOWN_MS = 60000;
const DEFAULT_MAX_429_RETRIES = 2;

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const maxRequestsPerSecond = positiveIntegerEnv("TDX_MAX_REQUESTS_PER_SECOND", DEFAULT_MAX_REQUESTS_PER_SECOND);
const maxRequestsPerMinute = positiveIntegerEnv("TDX_MAX_REQUESTS_PER_MINUTE", DEFAULT_MAX_REQUESTS_PER_MINUTE);
const max429Retries = positiveIntegerEnv("TDX_MAX_429_RETRIES", DEFAULT_MAX_429_RETRIES);
const configuredMinimumRequestIntervalMs = positiveIntegerEnv(
  "TDX_MIN_REQUEST_INTERVAL_MS",
  DEFAULT_MIN_REQUEST_INTERVAL_MS
);
const minimumRequestIntervalMs = Math.max(
  1000 / maxRequestsPerSecond,
  60000 / maxRequestsPerMinute,
  configuredMinimumRequestIntervalMs
);
const rateLimitStatePath = path.join(__dirname, "..", "data", "tdx-rate-limit.json");
const rateLimitLockPath = `${rateLimitStatePath}.lock`;
let rateLimitQueue = Promise.resolve();

const tdxMetrics = {
  version: 0,
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  inFlight: 0,
  lastCallAt: 0,
};
const metricsWaiters = new Set<() => void>();

function notifyMetricsChanged(): void {
  tdxMetrics.version += 1;
  for (const resolve of metricsWaiters) resolve();
  metricsWaiters.clear();
}

interface RateLimitState {
  requestTimestamps: number[];
  nextRequestAt: number;
  cooldownUntil: number;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireRateLimitLock(): Promise<void> {
  await mkdir(path.dirname(rateLimitStatePath), { recursive: true });
  while (true) {
    try {
      await mkdir(rateLimitLockPath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(rateLimitLockPath)).mtimeMs > 30000) {
          await rm(rateLimitLockPath, { recursive: true, force: true });
        }
      } catch {
        // Another process may have removed the stale lock already.
      }
      await pause(50);
    }
  }
}

async function withRateLimitLock<T>(callback: () => Promise<T>): Promise<T> {
  await acquireRateLimitLock();
  try {
    return await callback();
  } finally {
    await rm(rateLimitLockPath, { recursive: true, force: true });
  }
}

async function readRateLimitState(): Promise<RateLimitState> {
  try {
    const raw = await readFile(rateLimitStatePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RateLimitState>;
    return {
      requestTimestamps: Array.isArray(parsed.requestTimestamps)
        ? parsed.requestTimestamps.filter((value): value is number => Number.isFinite(value))
        : [],
      nextRequestAt: typeof parsed.nextRequestAt === "number" && Number.isFinite(parsed.nextRequestAt)
        ? parsed.nextRequestAt
        : 0,
      cooldownUntil: typeof parsed.cooldownUntil === "number" && Number.isFinite(parsed.cooldownUntil)
        ? parsed.cooldownUntil
        : 0,
    };
  } catch {
    return { requestTimestamps: [], nextRequestAt: 0, cooldownUntil: 0 };
  }
}

async function writeRateLimitState(state: RateLimitState): Promise<void> {
  const temporaryPath = `${rateLimitStatePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state), "utf8");
  await rename(temporaryPath, rateLimitStatePath);
}

/** Serializes TDX requests and pauses between them to stay below configured limits. */
async function waitForTdxRequestSlot(): Promise<void> {
  let release!: () => void;
  const previous = rateLimitQueue;
  rateLimitQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;

  try {
    while (true) {
      const wait = await withRateLimitLock(async () => {
        const state = await readRateLimitState();
        const now = Date.now();
        state.requestTimestamps = state.requestTimestamps.filter((timestamp) => now - timestamp < 60000);
        const recentSecondRequests = state.requestTimestamps.filter((timestamp) => now - timestamp < 1000);
        const secondWait = recentSecondRequests.length >= maxRequestsPerSecond
          ? 1000 - (now - (recentSecondRequests[0] ?? now))
          : 0;
        const minuteWait = state.requestTimestamps.length >= maxRequestsPerMinute
          ? 60000 - (now - (state.requestTimestamps[0] ?? now))
          : 0;
        const intervalWait = Math.max(0, state.nextRequestAt - now);
        const cooldownWait = Math.max(0, state.cooldownUntil - now);
        const nextWait = Math.max(secondWait, minuteWait, intervalWait, cooldownWait);
        if (nextWait === 0) {
          state.requestTimestamps.push(now);
          state.nextRequestAt = now + minimumRequestIntervalMs;
          await writeRateLimitState(state);
        } else {
          await writeRateLimitState(state);
        }
        return nextWait;
      });

      if (wait > 0) {
        await pause(wait);
        continue;
      }

      return;
    }
  } finally {
    release();
  }
}

async function startTdxCooldown(cooldownMs = RATE_LIMIT_COOLDOWN_MS): Promise<void> {
  await withRateLimitLock(async () => {
    const state = await readRateLimitState();
    state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + cooldownMs);
    await writeRateLimitState(state);
  });
}

export async function getTdxMetrics() {
  const state = await withRateLimitLock(readRateLimitState);
  const now = Date.now();
  return {
    ...tdxMetrics,
    callsInLastMinute: state.requestTimestamps.filter((timestamp) => now - timestamp < 60000).length,
    maxRequestsPerSecond,
    maxRequestsPerMinute,
    minimumRequestIntervalMs,
    cooldownUntil: state.cooldownUntil > now ? state.cooldownUntil : null,
  };
}

export async function waitForTdxMetricsChange(since: number, timeoutMs = 25000): Promise<void> {
  if (tdxMetrics.version !== since) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      metricsWaiters.delete(finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    metricsWaiters.add(finish);
    if (tdxMetrics.version !== since) finish();
  });
}

interface CachedToken {
  accessToken: string;
  /** epoch ms at which the token should be considered expired */
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let inFlightTokenRequest: Promise<string> | null = null;

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;
  if (!clientId || !clientSecret || clientId === "your-client-id") {
    throw new TdxConfigError(
      "尚未設定 TDX_CLIENT_ID / TDX_CLIENT_SECRET，請參考 server/.env.example 設定後重新啟動伺服器。"
    );
  }
  return { clientId, clientSecret };
}

export class TdxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TdxConfigError";
  }
}

export class TdxApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TdxApiError";
    this.status = status;
  }
}

/** Fetches (and caches) an OAuth2 client-credentials access token from TDX. */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.accessToken;
  }
  if (inFlightTokenRequest) {
    return inFlightTokenRequest;
  }

  const { clientId, clientSecret } = getCredentials();

  inFlightTokenRequest = (async () => {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(TDX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new TdxApiError(
        `無法取得 TDX 授權 token (status ${response.status}): ${text}`,
        response.status
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    // refresh 60 seconds before actual expiry to be safe
    const expiresAt = Date.now() + Math.max(data.expires_in - 60, 30) * 1000;
    cachedToken = { accessToken: data.access_token, expiresAt };
    return data.access_token;
  })();

  try {
    return await inFlightTokenRequest;
  } finally {
    inFlightTokenRequest = null;
  }
}

/** Calls a TDX API path (relative to /api/basic) with the cached bearer token, returning parsed JSON. */
export async function tdxGet<T>(path: string, searchParams?: Record<string, string>): Promise<T> {
  const url = new URL(`${TDX_API_BASE}${path}`);
  url.searchParams.set("$format", "JSON");
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  for (let attempt = 0; attempt <= max429Retries; attempt += 1) {
    await waitForTdxRequestSlot();
    const token = await getAccessToken();
    tdxMetrics.totalCalls += 1;
    tdxMetrics.inFlight += 1;
    tdxMetrics.lastCallAt = Date.now();
    notifyMetricsChanged();
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        tdxMetrics.failedCalls += 1;
        notifyMetricsChanged();
        const text = await response.text().catch(() => "");
        if (response.status === 429) {
          const retryAfterSeconds = Number(response.headers.get("retry-after"));
          const cooldownMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? Math.max(RATE_LIMIT_COOLDOWN_MS, retryAfterSeconds * 1000)
            : RATE_LIMIT_COOLDOWN_MS;
          await startTdxCooldown(cooldownMs);
          if (attempt < max429Retries) continue;
        }
        throw new TdxApiError(`TDX API 呼叫失敗 (status ${response.status}): ${text}`, response.status);
      }

      tdxMetrics.successfulCalls += 1;
      notifyMetricsChanged();
      return (await response.json()) as T;
    } finally {
      tdxMetrics.inFlight -= 1;
      notifyMetricsChanged();
    }
  }

  throw new TdxApiError("TDX API 重試次數已用完。", 429);
}
