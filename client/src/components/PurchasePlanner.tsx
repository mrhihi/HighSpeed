import { useEffect, useRef, useState } from "react";
import { fetchSeatPlans, recordUsageEvent } from "../api/client";
import { expandDateRange, isPastDate, isTimeString, todayString } from "../utils/dates";
import type { PlannerDayResult, SeatPlan, Station } from "../types";
import { LoadingErrorState } from "./LoadingErrorState";
import { TimeInput } from "./TimeInput";
import { SavedConditions } from "./SavedConditions";
import { DataFreshnessNote } from "./DataFreshnessNote";
import type { UsageStats } from "../api/client";

interface PlannerCondition {
  originStationId: string;
  destinationStationId: string;
  earliestDate: string;
  earliestTime: string;
  latestDate: string;
  latestTime: string;
  transferMinutes: number;
  maxTransferMinutes: number;
  selectedIntermediateStationIds: string[];
  selectedSeatModes: Array<"reserved-standard" | "reserved-business" | "free">;
}

interface PurchasePlannerProps {
  stations: Station[];
  stationsLoading: boolean;
  stationsError: string | null;
  onUsageStats?: (stats: UsageStats) => void;
}

function formatTime(time?: string): string {
  return time ? time.slice(0, 5) : "—";
}

function planTitle(plan: SeatPlan): string {
  if (plan.segments.length === 1) return "直達方案";
  if (plan.segments.some((segment) => segment.seatMode === "free")) return "同車次：劃位＋自由座";
  if (plan.segments[0]?.trainNo === plan.segments[1]?.trainNo) return "同車次分段方案";
  return "中間站轉乘方案";
}

function seatModeLabel(mode: SeatPlan["segments"][number]["seatMode"]): string {
  if (mode === "free") return "自由座";
  if (mode === "reserved-business") return "商務席";
  return "標準席";
}

function statusLabel(status?: string): string {
  if (status === "O") return "尚有座位";
  if (status === "L") return "座位有限";
  if (status === "X") return "無對號座";
  return "未確認";
}

const THSR_STATION_ORDER = ["0990", "1000", "1010", "1020", "1030", "1035", "1040", "1043", "1047", "1050", "1060", "1070"];

function routeIntermediateStations(stations: Station[], origin: string, destination: string): Station[] {
  const ordered = [...stations].sort((a, b) => {
    const ai = THSR_STATION_ORDER.indexOf(a.StationID);
    const bi = THSR_STATION_ORDER.indexOf(b.StationID);
    return (ai < 0 ? Number(a.StationID) : ai) - (bi < 0 ? Number(b.StationID) : bi);
  });
  const from = ordered.findIndex((station) => station.StationID === origin);
  const to = ordered.findIndex((station) => station.StationID === destination);
  if (from < 0 || to < 0) return [];
  return ordered.slice(Math.min(from, to) + 1, Math.max(from, to));
}

function SegmentTimeline({ plan }: { plan: SeatPlan }) {
  return (
    <div className="plan-timeline" aria-label="分段行程時間軸">
      {plan.segments.map((segment, index) => (
        <div className="plan-segment" key={`${segment.trainNo}-${segment.originStationId}-${segment.destinationStationId}`}>
          <div className="plan-station-dot" />
          <div className="plan-segment-main">
            <div className="plan-segment-route">
              <strong>{segment.originStationName.Zh_tw ?? segment.originStationId}</strong>
              <span>→</span>
              <strong>{segment.destinationStationName.Zh_tw ?? segment.destinationStationId}</strong>
            </div>
            <div className="plan-segment-meta">
              <span>車次 {segment.trainNo}</span>
              <span>{formatTime(segment.departureTime)}–{formatTime(segment.arrivalTime)}</span>
              <span className={`plan-seat-mode ${segment.seatMode === "free" ? "free" : "reserved"}`}>
                {seatModeLabel(segment.seatMode)}
              </span>
              {segment.seatMode !== "free" && <span>{statusLabel(segment.seatStatus)}</span>}
            </div>
          </div>
          {index < plan.segments.length - 1 && (
            <div className="plan-transfer">
              <span>轉乘</span>
              <strong>{plan.transferMinutes ?? 0} 分鐘</strong>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PlanCard({ plan }: { plan: SeatPlan }) {
  return (
    <article className={`plan-card ${plan.rank === 1 ? "recommended" : ""}`}>
      <div className="plan-card-header">
        <div>
          <span className="plan-rank">方案 {plan.rank}</span>
          <h3>{planTitle(plan)}</h3>
        </div>
        {plan.rank === 1 && <span className="recommended-label">優先嘗試</span>}
      </div>
      <div className="plan-summary">
        <span>{formatTime(plan.totalDepartureTime)} 出發</span>
        <span>→</span>
        <span>{formatTime(plan.totalArrivalTime)} 抵達</span>
        <span>{plan.transfers === 0 ? "不需轉車" : `轉車 ${plan.transfers} 次`}</span>
      </div>
      <SegmentTimeline plan={plan} />
      {plan.warnings.length > 0 && (
        <div className="plan-warnings" role="note">
          {plan.warnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}
        </div>
      )}
      <details className="purchase-steps">
        <summary>查看購票步驟</summary>
        <ol>{plan.purchaseSteps.map((step) => <li key={step}>{step.replace(/^\d+\. /, "")}</li>)}</ol>
        <p>請在官方訂票通路再次確認即時票況；本工具不會代為鎖位或購票。</p>
      </details>
    </article>
  );
}

export function PurchasePlanner({ stations, stationsLoading, stationsError, onUsageStats }: PurchasePlannerProps) {
  const [originStationId, setOriginStationId] = useState("");
  const [destinationStationId, setDestinationStationId] = useState("");
  const [earliestDate, setEarliestDate] = useState(todayString());
  const [earliestTime, setEarliestTime] = useState("00:00");
  const [latestDate, setLatestDate] = useState(todayString());
  const [latestTime, setLatestTime] = useState("23:59");
  const [transferMinutes, setTransferMinutes] = useState(15);
  const [maxTransferMinutes, setMaxTransferMinutes] = useState(120);
  const [selectedIntermediateStationIds, setSelectedIntermediateStationIds] = useState<string[]>([]);
  const [selectedSeatModes, setSelectedSeatModes] = useState<PlannerCondition["selectedSeatModes"]>([
    "reserved-standard", "reserved-business", "free",
  ]);
  const [results, setResults] = useState<PlannerDayResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preserveLoadedStations = useRef(false);

  const intermediateStations = routeIntermediateStations(stations, originStationId, destinationStationId);
  useEffect(() => {
    if (preserveLoadedStations.current) {
      preserveLoadedStations.current = false;
      return;
    }
    setSelectedIntermediateStationIds(intermediateStations.map((station) => station.StationID));
  }, [originStationId, destinationStationId, stations]);

  const dates = expandDateRange(earliestDate, latestDate);
  const departureStart = `${earliestDate}T${earliestTime}`;
  const departureEnd = `${latestDate}T${latestTime}`;
  const today = todayString();
  const earliestDatePast = isPastDate(earliestDate, today);
  const latestDatePast = isPastDate(latestDate, today);
  const validTimes = isTimeString(earliestTime) && isTimeString(latestTime);
  const canPlan = Boolean(originStationId && destinationStationId && originStationId !== destinationStationId && earliestDate <= latestDate && !earliestDatePast && !latestDatePast && validTimes && dates.length > 0 && selectedSeatModes.length > 0 && maxTransferMinutes >= transferMinutes) && !loading;

  const clearConditions = () => {
    preserveLoadedStations.current = false;
    setOriginStationId("");
    setDestinationStationId("");
    setEarliestDate(todayString());
    setEarliestTime("00:00");
    setLatestDate(todayString());
    setLatestTime("23:59");
    setTransferMinutes(15);
    setMaxTransferMinutes(120);
    setSelectedIntermediateStationIds([]);
    setSelectedSeatModes(["reserved-standard", "reserved-business", "free"]);
    setResults([]);
    setError(null);
  };

  const handlePlan = async (forceRefresh = false) => {
    if (!canPlan) return;
    recordUsageEvent("recommendation").then((stats) => onUsageStats?.(stats)).catch(() => undefined);
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSeatPlans(originStationId, destinationStationId, dates, transferMinutes, maxTransferMinutes, departureStart, departureEnd, selectedIntermediateStationIds, selectedSeatModes, forceRefresh);
      setResults(response.results);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "無法產生購票建議");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="planner-workspace" role="tabpanel" aria-label="購票建議">
      <DataFreshnessNote />
      <SavedConditions<PlannerCondition>
        storageKey="highspeed.saved.planner-conditions"
        label="購票建議"
        value={{ originStationId, destinationStationId, earliestDate, earliestTime, latestDate, latestTime, transferMinutes, maxTransferMinutes, selectedIntermediateStationIds, selectedSeatModes }}
        onClear={clearConditions}
        onLoad={(saved) => {
          preserveLoadedStations.current = true;
          setOriginStationId(saved.originStationId);
          setDestinationStationId(saved.destinationStationId);
          setEarliestDate(saved.earliestDate);
          setEarliestTime(saved.earliestTime);
          setLatestDate(saved.latestDate);
          setLatestTime(saved.latestTime);
          setTransferMinutes(saved.transferMinutes);
          setMaxTransferMinutes(saved.maxTransferMinutes ?? 120);
          setSelectedIntermediateStationIds(saved.selectedIntermediateStationIds ?? []);
          setSelectedSeatModes(saved.selectedSeatModes?.length ? saved.selectedSeatModes : ["reserved-standard", "reserved-business", "free"]);
          setResults([]);
          setError(null);
        }}
      />
      <div className="planner-intro">
        <div>
          <p className="eyebrow">SMART BOOKING</p>
          <h2>找出比較容易買到票的組合</h2>
          <p>先找直達車；若座位不足，再嘗試中間站分段、不同車次轉乘，或同車次劃位與自由座搭配。</p>
        </div>
          <div className="planner-note">例如設定 9/24 17:30 到 9/25 12:00，就能查下班後到隔天中午前的出發組合。自由座只代表有自由座車廂，無法保證現場一定有座位。</div>
      </div>
      <div className="planner-form-shell">
        <div className="planner-route-fields">
          <label className="field"><span>起站</span><select value={originStationId} disabled={stationsLoading || Boolean(stationsError)} onChange={(e) => setOriginStationId(e.target.value)}><option value="">請選擇起站</option>{stations.map((station) => <option key={station.StationID} value={station.StationID}>{station.StationName.Zh_tw}</option>)}</select></label>
          <div className="route-arrow">→</div>
          <label className="field"><span>迄站</span><select value={destinationStationId} disabled={stationsLoading || Boolean(stationsError)} onChange={(e) => setDestinationStationId(e.target.value)}><option value="">請選擇迄站</option>{stations.map((station) => <option key={station.StationID} value={station.StationID}>{station.StationName.Zh_tw}</option>)}</select></label>
        </div>
        <div className="planner-fields-grid">
          <label className="field"><span>最早出發日期</span><input type="date" value={earliestDate} className={earliestDatePast ? "date-input-past" : ""} aria-invalid={earliestDatePast} onChange={(e) => setEarliestDate(e.target.value)} />{earliestDatePast && <span className="past-date-warning">日期已過期</span>}</label>
          <label className="field"><span>最早出發時間</span><TimeInput value={earliestTime} ariaLabel="最早出發時間" onChange={setEarliestTime} /></label>
          <label className="field"><span>最晚出發日期</span><input type="date" value={latestDate} className={latestDatePast ? "date-input-past" : ""} aria-invalid={latestDatePast} onChange={(e) => setLatestDate(e.target.value)} />{latestDatePast && <span className="past-date-warning">日期已過期</span>}</label>
          <label className="field"><span>最晚出發時間</span><TimeInput value={latestTime} ariaLabel="最晚出發時間" onChange={setLatestTime} /></label>
          <label className="field"><span>最小轉乘時間</span><select value={transferMinutes} onChange={(e) => setTransferMinutes(Number(e.target.value))}><option value={3}>3 分鐘</option><option value={10}>10 分鐘</option><option value={15}>15 分鐘</option><option value={20}>20 分鐘</option><option value={30}>30 分鐘</option></select></label>
          <label className="field"><span>最大轉乘時間</span><select value={maxTransferMinutes} onChange={(e) => setMaxTransferMinutes(Number(e.target.value))}><option value={15}>15 分鐘</option><option value={30}>30 分鐘</option><option value={60}>60 分鐘</option><option value={90}>90 分鐘</option><option value={120}>120 分鐘</option><option value={180}>180 分鐘</option><option value={240}>240 分鐘</option></select></label>
        </div>
        {intermediateStations.length > 0 && (
          <fieldset className="intermediate-stations-fieldset">
            <legend>要嘗試的中間站</legend>
            <p className="field-help">可取消不想查的站。選擇越多，系統需要查詢的路段越多，建議產生時間也會越久。</p>
            <div className="intermediate-station-actions">
              <button type="button" className="text-button" onClick={() => setSelectedIntermediateStationIds(intermediateStations.map((station) => station.StationID))}>全選</button>
              <button type="button" className="text-button" onClick={() => setSelectedIntermediateStationIds([])}>全部取消</button>
              <span>{selectedIntermediateStationIds.length} / {intermediateStations.length} 站</span>
            </div>
            <div className="intermediate-stations-list">
              {intermediateStations.map((station) => (
                <label className="station-checkbox" key={station.StationID}>
                  <input
                    type="checkbox"
                    checked={selectedIntermediateStationIds.includes(station.StationID)}
                    onChange={(event) => setSelectedIntermediateStationIds((current) => event.target.checked ? [...current, station.StationID] : current.filter((id) => id !== station.StationID))}
                  />
                  <span>{station.StationName.Zh_tw}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="seat-modes-fieldset">
          <legend>要組合的票種</legend>
          <p className="field-help">可複選票種，系統只會產生勾選的購票方案。</p>
          <div className="seat-modes-list">
            {([
              ["reserved-standard", "標準席"],
              ["reserved-business", "商務席"],
              ["free", "自由座"],
            ] as const).map(([mode, label]) => (
              <label className="station-checkbox" key={mode}>
                <input
                  type="checkbox"
                  checked={selectedSeatModes.includes(mode)}
                  onChange={(event) => setSelectedSeatModes((current) => event.target.checked ? [...current, mode] : current.filter((item) => item !== mode))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {selectedSeatModes.length === 0 && <p className="status-message status-error">請至少選擇一種票種</p>}
        {originStationId === destinationStationId && originStationId && <p className="status-message status-error">起站與迄站不可相同</p>}
        {earliestDate > latestDate && <p className="status-message status-error">最晚出發日期不可早於最早出發日期</p>}
        {earliestDate === latestDate && earliestTime > latestTime && <p className="status-message status-error">最晚出發時間不可早於最早出發時間</p>}
        {maxTransferMinutes < transferMinutes && <p className="status-message status-error">最大轉乘時間不可小於最小轉乘時間</p>}
        {!validTimes && <p className="status-message status-error">時間請使用 24 小時制 HH:mm，例如 17:30</p>}
        <div className="planner-actions">
          <button type="button" className="search-button" onClick={() => handlePlan()} disabled={!canPlan}>產生購票建議</button>
          {results.length > 0 && <button type="button" className="refresh-button" onClick={() => handlePlan(true)} disabled={!canPlan}>↻ 強制更新方案</button>}
        </div>
        <LoadingErrorState loading={loading} error={error} />
      </div>
      {results.length > 0 && (
        <div className="planner-results" aria-live="polite">
          <div className="planner-results-heading"><div><p className="eyebrow">RECOMMENDATIONS</p><h2>購票建議</h2></div><span>每個日期最多 3 個方案</span></div>
          {results.map((day) => <div className="planner-day" key={day.date}><div className="planner-day-heading"><h3>{day.date}</h3>{day.cachedAt && <span>{day.stale ? "顯示過期快取" : day.cached ? "來自本地快取" : "剛更新"} · {new Date(day.cachedAt).toLocaleString("zh-TW")}</span>}</div>{day.error ? <p className="day-error">查詢失敗：{day.error}</p> : day.plans.length === 0 ? <div className="no-plans"><strong>目前沒有可組合的方案</strong><p>可以放寬時間條件、降低轉乘限制，或改到「純查詢」查看所有車次。</p></div> : <div className="plan-list">{day.plans.map((plan) => <PlanCard key={`${day.date}-${plan.rank}-${plan.segments.map((segment) => segment.trainNo).join("-")}`} plan={plan} />)}</div>}</div>)}
        </div>
      )}
    </section>
  );
}
