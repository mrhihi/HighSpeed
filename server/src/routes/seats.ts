import { Router } from "express";
import { fetchDailySeatData } from "../dailySeatData";
import type {
  DaySeatResult,
  SeatSearchRequestBody,
} from "../types";

const router = Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATES_PER_REQUEST = 60;
router.post("/", async (req, res) => {
  const body = req.body as Partial<SeatSearchRequestBody>;
  const { originStationId, destinationStationId, dates, forceRefresh = false } = body;

  if (!originStationId || !destinationStationId) {
    res.status(400).json({ error: "請提供起站與迄站代碼 (originStationId, destinationStationId)。" });
    return;
  }
  if (originStationId === destinationStationId) {
    res.status(400).json({ error: "起站與迄站不可相同。" });
    return;
  }
  if (!Array.isArray(dates) || dates.length === 0) {
    res.status(400).json({ error: "請至少提供一個查詢日期 (dates)。" });
    return;
  }
  const invalidDate = dates.find((d) => typeof d !== "string" || !DATE_PATTERN.test(d));
  if (invalidDate) {
    res.status(400).json({ error: `日期格式錯誤: ${invalidDate}，格式須為 yyyy-MM-dd。` });
    return;
  }
  if (dates.length > MAX_DATES_PER_REQUEST) {
    res.status(400).json({ error: `一次最多查詢 ${MAX_DATES_PER_REQUEST} 個日期。` });
    return;
  }

  const uniqueDates = Array.from(new Set(dates));

  const results: DaySeatResult[] = await Promise.all(
    uniqueDates.map(async (date): Promise<DaySeatResult> => {
      try {
        const seatData = await fetchDailySeatData(date, forceRefresh);
        const { seats } = seatData.getSegment(originStationId, destinationStationId);

        seats.sort((a, b) => (a.DepartureTime ?? "").localeCompare(b.DepartureTime ?? ""));

        return {
          date,
          seats,
          cached: seatData.fromCache,
          stale: seatData.stale,
          cachedAt: new Date(seatData.cachedAt).toISOString(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "查詢失敗";
        return { date, seats: [], error: message };
      }
    })
  );

  // keep results ordered by the originally requested date order
  results.sort((a, b) => a.date.localeCompare(b.date));

  res.json({ results });
});

export default router;
