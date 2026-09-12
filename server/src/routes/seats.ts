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

/** Fetches the timetable for one OD and indexes it by train number. */
async function fetchTrainTimesByTrainNo(
  origin: string,
  destination: string,
  date: string,
  dependencies: { getOrFetchCached: typeof getOrFetchCached; tdxGet: typeof tdxGet },
): Promise<Map<string, { departureTime?: string; arrivalTime?: string }>> {
  const result = await dependencies.getOrFetchCached(
    "timetable",
    `${origin}:${destination}:${date}`,
    TIMETABLE_CACHE_TTL_MS,
    () => dependencies.tdxGet<RailODDailyTimetable[]>(
      `/v2/Rail/THSR/DailyTimetable/OD/${encodeURIComponent(origin)}/to/${encodeURIComponent(destination)}/${encodeURIComponent(date)}`,
    ),
  );
  return new Map(result.value.map((entry) => [entry.DailyTrainInfo.TrainNo, {
    departureTime: entry.OriginStopTime?.DepartureTime,
    arrivalTime: entry.DestinationStopTime?.ArrivalTime,
  }]));
}

export async function fetchSeatSegment(
  origin: string,
  destination: string,
  date: string,
  forceRefresh = false,
  dependencies = { getOrFetchCached, tdxGet },
): Promise<{
  seats: AvailableSeat[];
  fromCache: boolean;
  stale: boolean;
  cachedAt: number;
  tdxUpdatedAt?: string;
  sourceUpdatedAt?: string;
}> {
  const seatData = await dependencies.getOrFetchCached(
    "seats",
    `${origin}:${destination}:${date}`,
    SEAT_CACHE_TTL_MS,
    () => dependencies.tdxGet<AvailableSeatStatusWrapper>(
      `/v2/Rail/THSR/AvailableSeatStatus/Train/OD/${encodeURIComponent(origin)}/to/${encodeURIComponent(destination)}/TrainDate/${encodeURIComponent(date)}`,
    ),
    forceRefresh,
  );
  const seats: AvailableSeat[] = [...(seatData.value.AvailableSeats ?? [])];

  try {
    const timesByTrainNo = await fetchTrainTimesByTrainNo(origin, destination, date, dependencies);
    for (const seat of seats) {
      const times = timesByTrainNo.get(seat.TrainNo);
      if (times) {
        seat.DepartureTime = times.departureTime;
        seat.ArrivalTime = times.arrivalTime;
      }
    }
  } catch {
    // Seat availability remains useful when timetable enrichment fails.
  }

  return {
    seats,
    fromCache: seatData.fromCache,
    stale: seatData.stale,
    cachedAt: seatData.cachedAt,
    tdxUpdatedAt: seatData.value.UpdateTime,
    sourceUpdatedAt: seatData.value.SrcUpdateTime,
  };
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
        const seatData = await fetchSeatSegment(originStationId, destinationStationId, date, forceRefresh);
        const { seats } = seatData;

        seats.sort((a, b) => (a.DepartureTime ?? "").localeCompare(b.DepartureTime ?? ""));

        return {
          date,
          seats,
          cached: seatData.fromCache,
          stale: seatData.stale,
          cachedAt: new Date(seatData.cachedAt).toISOString(),
          tdxUpdatedAt: seatData.tdxUpdatedAt,
          sourceUpdatedAt: seatData.sourceUpdatedAt,
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
