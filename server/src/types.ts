export interface NameType {
  Zh_tw?: string;
  En?: string;
}

export interface RailStation {
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
  StandardSeatStatus: string;
  BusinessSeatStatus: string;
  /** 起站發車時間 (格式: HH:mm:ss)，來自時刻表資料，若查無對應時刻表則為 undefined */
  DepartureTime?: string;
  /** 迄站抵達時間 (格式: HH:mm:ss)，來自時刻表資料，若查無對應時刻表則為 undefined */
  ArrivalTime?: string;
}

export interface AvailableSeatStatusWrapper {
  UpdateTime?: string;
  SrcUpdateTime?: string;
  Count?: number;
  TrainDate?: string;
  AvailableSeats: AvailableSeat[];
}

export interface RailStopTime {
  StationID: string;
  StationName: NameType;
  StopSequence: number;
  ArrivalTime?: string;
  DepartureTime: string;
}

export interface RailODDailyTimetable {
  TrainDate: string;
  DailyTrainInfo: {
    TrainNo: string;
    Direction: number;
  };
  OriginStopTime?: RailStopTime;
  DestinationStopTime?: RailStopTime;
}

export interface RailDailyTimetable {
  TrainDate: string;
  DailyTrainInfo: {
    TrainNo: string;
    Direction: number;
  };
  StopTimes: RailStopTime[];
}

export interface DaySeatResult {
  date: string;
  seats: AvailableSeat[];
  error?: string;
  cached?: boolean;
  stale?: boolean;
  cachedAt?: string;
  tdxUpdatedAt?: string;
  sourceUpdatedAt?: string;
}

export interface SeatSearchRequestBody {
  originStationId: string;
  destinationStationId: string;
  dates: string[];
  forceRefresh?: boolean;
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

export interface PlannerSearchRequestBody {
  originStationId: string;
  destinationStationId: string;
  dates: string[];
  minTransferMinutes?: number;
  maxTransferMinutes?: number;
  departureStart?: string;
  departureEnd?: string;
  selectedIntermediateStationIds?: string[];
  selectedSeatModes?: SeatMode[];
  forceRefresh?: boolean;
}
