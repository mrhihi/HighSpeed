export interface NameType {
  Zh_tw?: string;
  En?: string;
}

export interface Station {
  StationID: string;
  StationName: NameType;
  StationCode?: string;
}

export interface AvailableSeat {
  TrainNo: string;
  Direction: number;
  OriginStationID: string;
  OriginStationCode: string;
  OriginStationName: NameType;
  DestinationStationID: string;
  DestinationStationCode: string;
  DestinationStationName: NameType;
  /** 剩餘座位等級代碼 (O=尚有座位,L=座位有限,X=已無座位)，非確切張數 */
  StandardSeatStatus: string;
  BusinessSeatStatus: string;
  /** 起站發車時間 (HH:mm:ss)，若時刻表查無對應資料則為 undefined */
  DepartureTime?: string;
  /** 迄站抵達時間 (HH:mm:ss)，若時刻表查無對應資料則為 undefined */
  ArrivalTime?: string;
}

export interface DaySeatResult {
  date: string;
  seats: AvailableSeat[];
  error?: string;
  cached?: boolean;
  stale?: boolean;
  cachedAt?: string;
}

export interface SeatSearchResponse {
  results: DaySeatResult[];
}

export type SeatMode = "reserved-standard" | "reserved-business" | "free";

export interface SeatPlanSegment {
  originStationId: string;
  destinationStationId: string;
  originStationName: NameType;
  destinationStationName: NameType;
  trainNo: string;
  departureTime?: string;
  arrivalTime?: string;
  seatMode: SeatMode;
  seatStatus?: "O" | "L" | "X";
  freeSeatingAvailable?: boolean;
}

export interface SeatPlan {
  rank: number;
  totalDepartureTime?: string;
  totalArrivalTime?: string;
  transfers: number;
  transferMinutes?: number;
  segments: SeatPlanSegment[];
  warnings: string[];
  purchaseSteps: string[];
}

export interface PlannerDayResult {
  date: string;
  plans: SeatPlan[];
  error?: string;
  cached?: boolean;
  stale?: boolean;
  cachedAt?: string;
}

export interface SeatPlanResponse {
  results: PlannerDayResult[];
}

export type DateInputMode = "multi" | "range";

/** 一個查詢行程：起訖站 + 日期輸入 + 可選的最早/最晚出發時間，可重複新增以支援來回車次查詢 */
export interface TripLeg {
  id: string;
  originStationId: string;
  destinationStationId: string;
  dateMode: DateInputMode;
  multiDates: string[];
  rangeStart: string;
  rangeEnd: string;
  /** 最早出發時間 (HH:mm)，選填 */
  minTime: string;
  /** 最晚出發時間 (HH:mm)，選填 */
  maxTime: string;
}

export interface LegSearchResult {
  legId: string;
  originLabel: string;
  destinationLabel: string;
  results: DaySeatResult[];
  /** 整段行程查詢失敗時的訊息（例如網路或伺服器錯誤，非單日查無資料） */
  error?: string;
  direction?: number;
}
