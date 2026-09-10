import { Router } from "express";
import { tdxGet } from "../tdxClient";
import { getOrFetchCached } from "../cache";
import type {
  AvailableSeat,
  AvailableSeatStatusWrapper,
  DaySeatResult,
  RailODDailyTimetable,
  SeatSearchRequestBody,
} from "../types";

const router = Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATES_PER_REQUEST = 60;
function cacheTtlEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
const SEAT_CACHE_TTL_MS = cacheTtlEnv("TDX_SEAT_CACHE_TTL_MS", 60 * 1000);
const TIMETABLE_CACHE_TTL_MS = cacheTtlEnv("TDX_TIMETABLE_CACHE_TTL_MS", 24 * 60 * 60 * 1000);

/**
 * Fetches the OD daily timetable and returns a TrainNo -> {departure, arrival} lookup.
 * Timetable lookup is best-effort: if it fails, seat data is still returned without times.
 */
async function fetchTrainTimesByTrainNo(
  originStationId: string,
  destinationStationId: string,
  date: string
): Promise<Map<string, { departureTime?: string; arrivalTime?: string }>> {
  const result = await getOrFetchCached(
    "timetable",
    `${originStationId}:${destinationStationId}:${date}`,
    TIMETABLE_CACHE_TTL_MS,
    () => tdxGet<RailODDailyTimetable[]>(
      `/v2/Rail/THSR/DailyTimetable/OD/${encodeURIComponent(originStationId)}/to/${encodeURIComponent(
        destinationStationId
      )}/${encodeURIComponent(date)}`
    ),
  );
  const timetable = result.value;
  const lookup = new Map<string, { departureTime?: string; arrivalTime?: string }>();
  for (const entry of timetable) {
    lookup.set(entry.DailyTrainInfo.TrainNo, {
      departureTime: entry.OriginStopTime?.DepartureTime,
      arrivalTime: entry.DestinationStopTime?.ArrivalTime,
    });
  }
  return lookup;
}

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
        const seatData = await getOrFetchCached(
          "seats",
          `${originStationId}:${destinationStationId}:${date}`,
          SEAT_CACHE_TTL_MS,
          () => tdxGet<AvailableSeatStatusWrapper>(
            `/v2/Rail/THSR/AvailableSeatStatus/Train/OD/${encodeURIComponent(
              originStationId
            )}/to/${encodeURIComponent(destinationStationId)}/TrainDate/${encodeURIComponent(date)}`
          ),
          forceRefresh,
        );
        const seats: AvailableSeat[] = [...(seatData.value.AvailableSeats ?? [])];

        // Best-effort: enrich seats with departure/arrival times from the timetable API.
        // A failure here should not prevent seat availability from being returned.
        try {
          const timesByTrainNo = await fetchTrainTimesByTrainNo(originStationId, destinationStationId, date);
          for (const seat of seats) {
            const times = timesByTrainNo.get(seat.TrainNo);
            if (times) {
              seat.DepartureTime = times.departureTime;
              seat.ArrivalTime = times.arrivalTime;
            }
          }
        } catch {
          // ignore timetable errors; seat data is still valid without times
        }

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
