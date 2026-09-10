import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type UsageEvent = "view" | "query" | "recommendation";
export interface UsageStats {
  views: number;
  queries: number;
  recommendations: number;
}

const statsPath = path.join(__dirname, "..", "data", "usage-stats.json");
const lockPath = `${statsPath}.lock`;
const emptyStats: UsageStats = { views: 0, queries: 0, recommendations: 0 };

async function withLock<T>(callback: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(statsPath), { recursive: true });
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > 30000) await rm(lockPath, { recursive: true, force: true });
      } catch {
        // Another process may have removed the stale lock already.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    return await callback();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function readStats(): Promise<UsageStats> {
  try {
    const parsed = JSON.parse(await readFile(statsPath, "utf8")) as Partial<UsageStats>;
    return {
      views: typeof parsed.views === "number" && parsed.views >= 0 ? parsed.views : 0,
      queries: typeof parsed.queries === "number" && parsed.queries >= 0 ? parsed.queries : 0,
      recommendations: typeof parsed.recommendations === "number" && parsed.recommendations >= 0 ? parsed.recommendations : 0,
    };
  } catch {
    return { ...emptyStats };
  }
}

async function writeStats(stats: UsageStats): Promise<void> {
  const temporary = `${statsPath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(stats), "utf8");
  await rename(temporary, statsPath);
}

export async function getUsageStats(): Promise<UsageStats> {
  return withLock(readStats);
}

export async function recordUsageEvent(event: UsageEvent): Promise<UsageStats> {
  return withLock(async () => {
    const stats = await readStats();
    if (event === "view") stats.views += 1;
    if (event === "query") stats.queries += 1;
    if (event === "recommendation") stats.recommendations += 1;
    await writeStats(stats);
    return stats;
  });
}
