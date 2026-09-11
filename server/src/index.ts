import "dotenv/config";
import express from "express";
import cors from "cors";
import stationsRouter from "./routes/stations";
import seatsRouter from "./routes/seats";
import seatPlansRouter from "./routes/seatPlans";
import metricsRouter from "./routes/metrics";
import usageRouter from "./routes/usage";
import { cleanupExpiredCacheFiles } from "./cache";

const app = express();
const port = Number(process.env.PORT) || 4000;

function nonNegativeEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const cacheCleanupGracePeriodMs = nonNegativeEnv("TDX_CACHE_CLEANUP_GRACE_MS", 60 * 60 * 1000);
const cacheCleanupIntervalMs = positiveEnv("TDX_CACHE_CLEANUP_INTERVAL_MS", 60 * 60 * 1000);
const cacheCleanupRules = [
  { prefix: "seats-daily-", maxAgeMs: nonNegativeEnv("TDX_SEAT_CACHE_TTL_MS", 60 * 1000) },
  { prefix: "timetable-daily-", maxAgeMs: nonNegativeEnv("TDX_TIMETABLE_CACHE_TTL_MS", 24 * 60 * 60 * 1000) },
  { prefix: "seats-", maxAgeMs: nonNegativeEnv("TDX_SEAT_CACHE_TTL_MS", 60 * 1000) },
  { prefix: "timetable-", maxAgeMs: nonNegativeEnv("TDX_TIMETABLE_CACHE_TTL_MS", 24 * 60 * 60 * 1000) },
];

async function runCacheCleanup(): Promise<void> {
  try {
    const removed = await cleanupExpiredCacheFiles(cacheCleanupRules, cacheCleanupGracePeriodMs);
    if (removed > 0) console.log(`Removed ${removed} expired cache file(s).`);
  } catch (error) {
    console.error("Cache cleanup failed", error);
  }
}

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/stations", stationsRouter);
app.use("/api/seats", seatsRouter);
app.use("/api/seat-plans", seatPlansRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/usage", usageRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : "伺服器發生未預期錯誤";
  res.status(500).json({ error: message });
});

async function startServer(): Promise<void> {
  // Complete the first cleanup before accepting requests.
  await runCacheCleanup();

  const cacheCleanupTimer = setInterval(() => void runCacheCleanup(), cacheCleanupIntervalMs);
  cacheCleanupTimer.unref();

  app.listen(port, () => {
    console.log(`HighSpeed server listening on http://localhost:${port}`);
  });
}

void startServer();
