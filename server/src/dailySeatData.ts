import { getOrFetchCached } from "./cache";
import { tdxGet } from "./tdxClient";
import type { AvailableSeat, AvailableSeatStatusWrapper, RailDailyTimetable } from "./types";

function cacheTtlEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const SEAT_CACHE_TTL_MS = cacheTtlEnv("TDX_SEAT_CACHE_TTL_MS", 60 * 1000);
const TIMETABLE_CACHE_TTL_MS = cacheTtlEnv("TDX_TIMETABLE_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
const PAGE_SIZE = 10000;

async function fetchAllSeats(date: string, get: typeof tdxGet): Promise<AvailableSeatStatusWrapper> {
  let first: AvailableSeatStatusWrapper | undefined;
  const seats: AvailableSeat[] = [];
  while (true) {
    const page = await get<AvailableSeatStatusWrapper>(
      `/v2/Rail/THSR/AvailableSeatStatus/Train/OD/TrainDate/${encodeURIComponent(date)}`,
      { $top: String(PAGE_SIZE), $skip: String(seats.length) },
    );
    first ??= page;
    const rows = page.AvailableSeats ?? [];
    seats.push(...rows);
    if (rows.length < PAGE_SIZE) return { ...first, AvailableSeats: seats };
  }
}

async function fetchAllTimes(date: string, get: typeof tdxGet): Promise<RailDailyTimetable[]> {
  const timetable: RailDailyTimetable[] = [];
  while (true) {
    const page = await get<RailDailyTimetable[]>(
      `/v2/Rail/THSR/DailyTimetable/TrainDate/${encodeURIComponent(date)}`,
      { $top: String(PAGE_SIZE), $skip: String(timetable.length) },
    );
    timetable.push(...page);
    if (page.length < PAGE_SIZE) return timetable;
  }
}

/** Load once per date; all segment lookups below are synchronous and local. */
export async function fetchDailySeatData(
  date: string,
  forceRefresh = false,
  dependencies = { getOrFetchCached, tdxGet },
) {
  const seatData = await dependencies.getOrFetchCached(
    "seats-daily", date, SEAT_CACHE_TTL_MS,
    () => fetchAllSeats(date, dependencies.tdxGet), forceRefresh,
  );
  let timetable: RailDailyTimetable[] = [];
  try {
    const times = await dependencies.getOrFetchCached(
      "timetable-daily", date, TIMETABLE_CACHE_TTL_MS,
      () => fetchAllTimes(date, dependencies.tdxGet), forceRefresh,
    );
    timetable = times.value;
  } catch {
    // Seat searches remain useful without times; the planner filters untimed plans.
  }

  const timesByTrain = new Map(timetable.map((entry) => [
    entry.DailyTrainInfo.TrainNo,
    new Map(entry.StopTimes.map((stop) => [stop.StationID, stop])),
  ]));
  const seatsByOD = new Map<string, Map<string, AvailableSeat>>();
  for (const seat of seatData.value.AvailableSeats ?? []) {
    const stops = timesByTrain.get(seat.TrainNo);
    const origin = stops?.get(seat.OriginStationID);
    const destination = stops?.get(seat.DestinationStationID);
    const validOrder = origin && destination && origin.StopSequence < destination.StopSequence;
    const key = `${seat.OriginStationID}:${seat.DestinationStationID}`;
    let trains = seatsByOD.get(key);
    if (!trains) {
      trains = new Map();
      seatsByOD.set(key, trains);
    }
    trains.set(seat.TrainNo, {
      ...seat,
      DepartureTime: validOrder ? origin.DepartureTime : undefined,
      ArrivalTime: validOrder ? destination.ArrivalTime ?? undefined : undefined,
    });
  }

  return {
    fromCache: seatData.fromCache,
    stale: seatData.stale,
    cachedAt: seatData.cachedAt,
    getSegment(origin: string, destination: string) {
      // Copies prevent sorting or enriching one result from changing another.
      return { seats: [...(seatsByOD.get(`${origin}:${destination}`)?.values() ?? [])].map((seat) => ({ ...seat })) };
    },
  };
}
