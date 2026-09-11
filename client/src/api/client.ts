import type { SeatPlanResponse, SeatSearchResponse, Station } from "../types";

const API_BASE = `${import.meta.env.BASE_URL}api`;

export interface UsageStats {
  views: number;
  queries: number;
  recommendations: number;
}

export async function fetchUsageStats(): Promise<UsageStats> {
  const response = await fetch(`${API_BASE}/usage`);
  return parseJsonOrThrow<UsageStats>(response);
}

export async function recordUsageEvent(event: "view" | "query" | "recommendation"): Promise<UsageStats> {
  const response = await fetch(`${API_BASE}/usage/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  });
  return parseJsonOrThrow<UsageStats>(response);
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const message = (data && (data as { error?: string }).error) || `請求失敗 (status ${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function fetchStations(): Promise<Station[]> {
  const response = await fetch(`${API_BASE}/stations`);
  return parseJsonOrThrow<Station[]>(response);
}

export async function fetchSeatAvailability(
  originStationId: string,
  destinationStationId: string,
  dates: string[],
  forceRefresh = false,
): Promise<SeatSearchResponse> {
  const response = await fetch(`${API_BASE}/seats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originStationId, destinationStationId, dates, forceRefresh }),
  });
  return parseJsonOrThrow<SeatSearchResponse>(response);
}

export async function fetchSeatPlans(
  originStationId: string,
  destinationStationId: string,
  dates: string[],
  minTransferMinutes: number,
  maxTransferMinutes: number,
  departureStart: string,
  departureEnd: string,
  selectedIntermediateStationIds: string[],
  selectedSeatModes: Array<"reserved-standard" | "reserved-business" | "free">,
  forceRefresh = false,
): Promise<SeatPlanResponse> {
  const response = await fetch(`${API_BASE}/seat-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originStationId,
      destinationStationId,
      dates,
      minTransferMinutes,
      maxTransferMinutes,
      departureStart,
      departureEnd,
      selectedIntermediateStationIds,
      selectedSeatModes,
      forceRefresh,
    }),
  });
  return parseJsonOrThrow<SeatPlanResponse>(response);
}
