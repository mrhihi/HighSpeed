import { Router } from "express";
import { getOrFetchCached } from "../cache";
import { fetchDailySeatData } from "../dailySeatData";
import { tdxGet } from "../tdxClient";
import type {
  AvailableSeat,
  PlannerSearchRequestBody,
  RailStation,
  SeatMode,
  SeatPlan,
  SeatPlanSegment,
} from "../types";

const router = Router();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function cacheTtlEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
const FREE_SEATING_CACHE_TTL_MS = cacheTtlEnv("TDX_FREE_SEATING_CACHE_TTL_MS", 24 * 60 * 60 * 1000);
const STATION_CACHE_TTL_MS = Number.POSITIVE_INFINITY;
const DEFAULT_TRANSFER_MINUTES = 15;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const THSR_STATION_ORDER = ["0990", "1000", "1010", "1020", "1030", "1035", "1040", "1043", "1047", "1050", "1060", "1070"];

interface FreeSeatingCar {
  TrainNo?: string;
  Cars?: number[];
}

interface FreeSeatingWrapper {
  FreeSeatingCars?: FreeSeatingCar[];
}

async function fetchFreeTrainNumbers(date: string, forceRefresh: boolean): Promise<Set<string>> {
  const data = await getOrFetchCached(
    "free-seating",
    date,
    FREE_SEATING_CACHE_TTL_MS,
    () => tdxGet<FreeSeatingWrapper>(`/v2/Rail/THSR/DailyFreeSeatingCar/TrainDate/${encodeURIComponent(date)}`),
    forceRefresh,
  );
  return new Set((data.value.FreeSeatingCars ?? []).flatMap((item) => item.TrainNo ? [item.TrainNo] : []));
}

function statusRank(status: string): number {
  if (status === "O") return 0;
  if (status === "L") return 1;
  return 2;
}

function reservedOptions(seat: AvailableSeat): Array<{ mode: SeatMode; status: "O" | "L" }> {
  const options: Array<{ mode: SeatMode; status: "O" | "L" }> = [];
  if (seat.StandardSeatStatus === "O" || seat.StandardSeatStatus === "L") {
    options.push({ mode: "reserved-standard", status: seat.StandardSeatStatus });
  }
  if (seat.BusinessSeatStatus === "O" || seat.BusinessSeatStatus === "L") {
    options.push({ mode: "reserved-business", status: seat.BusinessSeatStatus });
  }
  return options.sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

function segmentFromSeat(
  seat: AvailableSeat,
  mode: SeatMode,
  status?: "O" | "L" | "X",
  freeSeatingAvailable?: boolean,
): SeatPlanSegment {
  return {
    originStationId: seat.OriginStationID,
    destinationStationId: seat.DestinationStationID,
    originStationName: seat.OriginStationName,
    destinationStationName: seat.DestinationStationName,
    trainNo: seat.TrainNo,
    departureTime: seat.DepartureTime,
    arrivalTime: seat.ArrivalTime,
    seatMode: mode,
    seatStatus: status,
    freeSeatingAvailable,
  };
}

function minutesBetween(first?: string, second?: string): number | undefined {
  if (!first || !second) return undefined;
  const parse = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return parse(second) - parse(first);
}

function sortPlans(plans: SeatPlan[]): SeatPlan[] {
  const uniquePlans = [...new Map(plans.map((plan) => [
    plan.segments.map((segment) => `${segment.originStationId}-${segment.destinationStationId}-${segment.trainNo}-${segment.seatMode}`).join("|"),
    plan,
  ])).values()];
  const planCategory = (plan: SeatPlan): number => {
    if (plan.segments.length === 1) return 0;
    if (plan.segments.some((segment) => segment.seatMode === "free")) return 2;
    // 跨車次需要實際轉乘，應與同車次分段分開排序，避免被同車次方案吃掉名額。
    if (plan.segments[0]?.trainNo !== plan.segments[1]?.trainNo) return 1;
    return 3;
  };
  const comparePlans = (a: SeatPlan, b: SeatPlan) => {
      const aRisk = a.segments.reduce((sum, segment) => sum + (segment.seatMode === "free" ? 3 : segment.seatStatus === "L" ? 1 : 0), 0);
      const bRisk = b.segments.reduce((sum, segment) => sum + (segment.seatMode === "free" ? 3 : segment.seatStatus === "L" ? 1 : 0), 0);
      return aRisk - bRisk || a.transfers - b.transfers || (a.transferMinutes ?? 999) - (b.transferMinutes ?? 999);
  };
  const ordered: SeatPlan[] = [];
  for (const category of [0, 1, 2, 3]) {
    const candidate = uniquePlans.filter((plan) => planCategory(plan) === category).sort(comparePlans)[0];
    if (candidate) ordered.push(candidate);
  }
  ordered.push(...uniquePlans.filter((plan) => !ordered.includes(plan)).sort(comparePlans));
  return ordered
    .slice(0, 3)
    .map((plan, index) => ({ ...plan, rank: index + 1 }));
}

function makePurchaseSteps(segments: SeatPlanSegment[]): string[] {
  return segments.map((segment, index) => {
    const seatType = segment.seatMode === "free" ? "自由座（需現場確認是否有座位）" : segment.seatMode === "reserved-business" ? "商務席" : "標準席";
    return `${index + 1}. 購買 ${segment.originStationName.Zh_tw ?? segment.originStationId} → ${segment.destinationStationName.Zh_tw ?? segment.destinationStationId}，車次 ${segment.trainNo}，${seatType}`;
  });
}

function makePlan(segments: SeatPlanSegment[], transferMinutes?: number): SeatPlan {
  const warnings = segments.flatMap((segment) => {
    const result: string[] = [];
    if (segment.seatStatus === "L") result.push(`車次 ${segment.trainNo} 有一段座位有限，建議立即確認。`);
    if (segment.seatMode === "free") result.push(`車次 ${segment.trainNo} 使用自由座，TDX 無法保證實際有座位。`);
    return result;
  });
  return {
    rank: 0,
    totalDepartureTime: segments[0]?.departureTime,
    totalArrivalTime: segments[segments.length - 1]?.arrivalTime,
    transfers: segments.length - 1,
    transferMinutes,
    segments,
    warnings,
    purchaseSteps: makePurchaseSteps(segments),
  };
}

async function makePlansForDate(
  origin: string,
  destination: string,
  date: string,
  stations: RailStation[],
  minTransferMinutes: number,
  maxTransferMinutes: number,
  forceRefresh: boolean,
  selectedIntermediateStationIds: string[],
  selectedSeatModes: SeatMode[],
  departureStart: string,
  departureEnd: string,
): Promise<{
  plans: SeatPlan[];
  cached: boolean;
  stale: boolean;
  cachedAt: number;
  tdxUpdatedAt?: string;
  sourceUpdatedAt?: string;
}> {
  const daily = await fetchDailySeatData(date, forceRefresh);
  const direct = daily.getSegment(origin, destination);
  const selectedModes = new Set(selectedSeatModes);
  const optionsForSeat = (seat: AvailableSeat) => reservedOptions(seat).filter((option) => selectedModes.has(option.mode));
  const directPlans = direct.seats.flatMap((seat) => optionsForSeat(seat).map((option) => makePlan([segmentFromSeat(seat, option.mode, option.status)])));
  const plans: SeatPlan[] = [...directPlans];

  const orderedIds = stations.map((station) => station.StationID).sort((a, b) => {
    const aIndex = THSR_STATION_ORDER.indexOf(a);
    const bIndex = THSR_STATION_ORDER.indexOf(b);
    return (aIndex < 0 ? Number(a) : aIndex) - (bIndex < 0 ? Number(b) : bIndex);
  });
  const originIndex = orderedIds.indexOf(origin);
  const destinationIndex = orderedIds.indexOf(destination);
  const routeIntermediateIds = orderedIds.slice(Math.min(originIndex, destinationIndex) + 1, Math.max(originIndex, destinationIndex));
  const selectedIntermediateIds = new Set(selectedIntermediateStationIds);
  const intermediateIds = routeIntermediateIds.filter((stationId) => selectedIntermediateIds.has(stationId));
  let freeTrainNumbers: Set<string> | null = null;

  for (const split of intermediateIds) {
    const first = daily.getSegment(origin, split);
    const second = daily.getSegment(split, destination);
    const firstByTrain = new Map(first.seats.map((seat) => [seat.TrainNo, seat]));
    const secondByTrain = new Map(second.seats.map((seat) => [seat.TrainNo, seat]));

    for (const firstSeat of first.seats) {
      for (const secondSeat of second.seats) {
        const sameTrain = firstSeat.TrainNo === secondSeat.TrainNo;
        const transferMinutes = sameTrain ? 0 : minutesBetween(firstSeat.ArrivalTime, secondSeat.DepartureTime);
        if (!sameTrain && (transferMinutes === undefined || transferMinutes < minTransferMinutes || transferMinutes > maxTransferMinutes)) continue;
        for (const firstOption of optionsForSeat(firstSeat)) {
          for (const secondOption of optionsForSeat(secondSeat)) {
            if (sameTrain || transferMinutes !== undefined) {
              plans.push(makePlan([
                segmentFromSeat(firstSeat, firstOption.mode, firstOption.status),
                segmentFromSeat(secondSeat, secondOption.mode, secondOption.status),
              ], transferMinutes));
            }
          }
        }
      }
    }

    const needsFreeSeats = selectedModes.has("free") && [...firstByTrain.values(), ...secondByTrain.values()].some((seat) =>
      seat.StandardSeatStatus === "X" && seat.TrainNo,
    );
    if (needsFreeSeats) {
      try {
        freeTrainNumbers ??= await fetchFreeTrainNumbers(date, forceRefresh);
        for (const firstSeat of first.seats) {
          for (const secondSeat of second.seats) {
            if (firstSeat.TrainNo !== secondSeat.TrainNo || !freeTrainNumbers.has(firstSeat.TrainNo)) continue;
            const firstOptions = optionsForSeat(firstSeat);
            const secondOptions = optionsForSeat(secondSeat);
            if (firstOptions.length > 0 && secondSeat.StandardSeatStatus === "X") {
              plans.push(makePlan([
                segmentFromSeat(firstSeat, firstOptions[0].mode, firstOptions[0].status),
                segmentFromSeat(secondSeat, "free", "X", true),
              ], 0));
            }
            if (secondOptions.length > 0 && firstSeat.StandardSeatStatus === "X") {
              plans.push(makePlan([
                segmentFromSeat(firstSeat, "free", "X", true),
                segmentFromSeat(secondSeat, secondOptions[0].mode, secondOptions[0].status),
              ], 0));
            }
          }
        }
      } catch {
        // Free seating is optional enrichment; reserved-seat plans remain usable.
      }
    }
  }

  // 必須先依出發時間篩選，再排序與截取前 3 筆，避免時段外的方案先佔掉名額。
  const plansInWindow = plans.filter((plan) => {
    if (!plan.totalDepartureTime) return false;
    const departure = `${date}T${plan.totalDepartureTime.slice(0, 5)}`;
    return departure >= departureStart && departure <= departureEnd;
  });
  // 座位有限視為最後兜底：只要時段內存在一個不含 L 的方案，就不推薦含 L 的方案。
  const plansWithoutLimitedSeats = plansInWindow.filter((plan) =>
    plan.segments.every((segment) => segment.seatStatus !== "L"),
  );
  return {
    plans: sortPlans(plansWithoutLimitedSeats.length > 0 ? plansWithoutLimitedSeats : plansInWindow),
    cached: daily.fromCache,
    stale: daily.stale,
    cachedAt: daily.cachedAt,
    tdxUpdatedAt: daily.tdxUpdatedAt,
    sourceUpdatedAt: daily.sourceUpdatedAt,
  };
}

router.post("/", async (req, res) => {
  const body = req.body as Partial<PlannerSearchRequestBody>;
  const { originStationId, destinationStationId, dates, forceRefresh = false } = body;
  const selectedIntermediateStationIds = Array.isArray(body.selectedIntermediateStationIds)
    ? body.selectedIntermediateStationIds.filter((stationId): stationId is string => typeof stationId === "string")
    : [];
  const selectedSeatModes: SeatMode[] = Array.isArray(body.selectedSeatModes)
    ? body.selectedSeatModes.filter((mode): mode is SeatMode => ["reserved-standard", "reserved-business", "free"].includes(mode))
    : ["reserved-standard", "reserved-business", "free"];
  const departureStart = body.departureStart;
  const departureEnd = body.departureEnd;
  const minTransferMinutes = body.minTransferMinutes ?? DEFAULT_TRANSFER_MINUTES;
  const maxTransferMinutes = body.maxTransferMinutes ?? 120;

  if (!originStationId || !destinationStationId || originStationId === destinationStationId) {
    res.status(400).json({ error: "請提供不同的起站與迄站。" });
    return;
  }
  if (!Array.isArray(dates) || dates.length === 0 || dates.some((date) => typeof date !== "string" || !DATE_PATTERN.test(date))) {
    res.status(400).json({ error: "請提供至少一個 yyyy-MM-dd 格式的日期。" });
    return;
  }
  if (!departureStart || !departureEnd || !DATETIME_PATTERN.test(departureStart) || !DATETIME_PATTERN.test(departureEnd)) {
    res.status(400).json({ error: "請提供完整的最早與最晚出發日期時間。" });
    return;
  }
  if (departureStart > departureEnd) {
    res.status(400).json({ error: "最晚出發日期時間不可早於最早出發日期時間。" });
    return;
  }
  if (!Number.isInteger(minTransferMinutes) || minTransferMinutes < 3 || minTransferMinutes > 120) {
    res.status(400).json({ error: "最小轉乘時間必須介於 3 到 120 分鐘。" });
    return;
  }
  if (!Number.isInteger(maxTransferMinutes) || maxTransferMinutes < 3 || maxTransferMinutes > 240 || maxTransferMinutes < minTransferMinutes) {
    res.status(400).json({ error: "最大轉乘時間必須介於最小轉乘時間與 240 分鐘之間。" });
    return;
  }
  if (selectedSeatModes.length === 0) {
    res.status(400).json({ error: "請至少選擇一種票種。" });
    return;
  }
  try {
    const stationData = await getOrFetchCached(
      "stations",
      "thsr",
      STATION_CACHE_TTL_MS,
      () => tdxGet<RailStation[]>("/v2/Rail/THSR/Station"),
    );
    const uniqueDates = [...new Set(dates)];
    const results = [];
    for (const date of uniqueDates) {
      try {
        const result = await makePlansForDate(originStationId, destinationStationId, date, stationData.value, minTransferMinutes, maxTransferMinutes, forceRefresh, selectedIntermediateStationIds, selectedSeatModes, departureStart, departureEnd);
        results.push({ date, ...result, cachedAt: new Date(result.cachedAt).toISOString() });
      } catch (error) {
        results.push({ date, plans: [], error: error instanceof Error ? error.message : "查詢失敗" });
      }
    }
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "無法產生購票建議" });
  }
});

export default router;
