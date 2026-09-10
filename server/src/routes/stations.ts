import { Router } from "express";
import { tdxGet } from "../tdxClient";
import { getOrFetchCached } from "../cache";
import type { RailStation } from "../types";

const router = Router();
// 車站清單幾乎不變：只有第一次沒有本地檔案時才向 TDX 取得，之後永久使用檔案快取。
const STATION_CACHE_TTL_MS = Number.POSITIVE_INFINITY;

router.get("/", async (_req, res) => {
  try {
    const stations = await getOrFetchCached(
      "stations",
      "thsr",
      STATION_CACHE_TTL_MS,
      () => tdxGet<RailStation[]>("/v2/Rail/THSR/Station"),
    );
    res.json(stations.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知錯誤";
    res.status(500).json({ error: message });
  }
});

export default router;
