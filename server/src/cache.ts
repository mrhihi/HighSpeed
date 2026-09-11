import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

export interface CacheLookup<T> {
  value: T;
  cachedAt: number;
  stale: boolean;
  fromCache: boolean;
}

const cacheDirectory = path.join(__dirname, "..", "data", "cache");
const inFlight = new Map<string, Promise<unknown>>();

export interface CacheCleanupRule {
  prefix: string;
  maxAgeMs: number;
}

function lockPath(namespace: string, key: string): string {
  return `${filePath(namespace, key)}.lock`;
}

async function withCacheLock<T>(namespace: string, key: string, callback: () => Promise<T>): Promise<T> {
  const lock = lockPath(namespace, key);
  await mkdir(cacheDirectory, { recursive: true });
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(lock)).mtimeMs > 30000) await rm(lock, { recursive: true, force: true });
      } catch {
        // Another process may have removed the stale lock already.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    return await callback();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

function filePath(namespace: string, key: string): string {
  const encodedKey = Buffer.from(key).toString("base64url");
  return path.join(cacheDirectory, `${namespace}-${encodedKey}.json`);
}

async function readEntry<T>(namespace: string, key: string): Promise<CacheEntry<T> | null> {
  try {
    const contents = await readFile(filePath(namespace, key), "utf8");
    const entry = JSON.parse(contents) as CacheEntry<T>;
    if (!entry || typeof entry.cachedAt !== "number" || !("value" in entry)) return null;
    return entry;
  } catch {
    return null;
  }
}

async function writeEntry<T>(namespace: string, key: string, value: T): Promise<CacheEntry<T>> {
  await mkdir(cacheDirectory, { recursive: true });
  const entry: CacheEntry<T> = { value, cachedAt: Date.now() };
  const target = filePath(namespace, key);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(temporary, JSON.stringify(entry), "utf8");
  await rename(temporary, target);
  return entry;
}

/** Reads a cache entry, retaining expired entries for stale fallback. */
export async function getCached<T>(
  namespace: string,
  key: string,
  maxAgeMs: number,
): Promise<CacheLookup<T> | null> {
  const entry = await readEntry<T>(namespace, key);
  if (!entry) return null;
  return { ...entry, stale: Date.now() - entry.cachedAt > maxAgeMs, fromCache: true };
}

/** Uses a fresh entry when possible and shares one upstream request per cache key. */
export async function getOrFetchCached<T>(
  namespace: string,
  key: string,
  maxAgeMs: number,
  fetchValue: () => Promise<T>,
  forceRefresh = false,
): Promise<CacheLookup<T>> {
  const cached = await getCached<T>(namespace, key, maxAgeMs);
  if (cached && !cached.stale && !forceRefresh) return cached;

  const requestKey = `${namespace}:${key}`;
  let request = inFlight.get(requestKey) as Promise<CacheLookup<T>> | undefined;
  if (!request) {
    request = (async () => {
      return withCacheLock(namespace, key, async () => {
        // Re-read after obtaining the cross-process lock so simultaneous workers
        // do not both fetch the same condition before either one writes the cache.
        const latest = await getCached<T>(namespace, key, maxAgeMs);
        if (latest && !latest.stale && !forceRefresh) return latest;
        try {
          const value = await fetchValue();
          const entry = await writeEntry(namespace, key, value);
          return { ...entry, stale: false, fromCache: false };
        } catch (error) {
          if (latest ?? cached) return latest ?? cached!;
          throw error;
        }
      });
    })();
    inFlight.set(requestKey, request);
  }

  try {
    return await request;
  } finally {
    if (inFlight.get(requestKey) === request) inFlight.delete(requestKey);
  }
}

/** Deletes expired JSON cache files while retaining a grace period for stale fallback. */
export async function cleanupExpiredCacheFiles(
  rules: CacheCleanupRule[],
  gracePeriodMs: number,
): Promise<number> {
  let filenames: string[];
  try {
    filenames = await readdir(cacheDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  const now = Date.now();
  let removed = 0;
  for (const filename of filenames) {
    if (!filename.endsWith(".json")) continue;
    const rule = rules.find((candidate) => filename.startsWith(candidate.prefix));
    if (!rule) continue;

    const file = path.join(cacheDirectory, filename);
    try {
      const entry = JSON.parse(await readFile(file, "utf8")) as Partial<CacheEntry<unknown>>;
      if (typeof entry.cachedAt !== "number" || now - entry.cachedAt <= rule.maxAgeMs + gracePeriodMs) continue;
      await unlink(file);
      removed += 1;
    } catch (error) {
      // Ignore a file that disappeared or is being replaced by a writer.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") continue;
    }
  }
  return removed;
}
