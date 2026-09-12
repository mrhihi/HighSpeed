import type { AvailableSeat, DaySeatResult, LegSearchResult } from "../types";
import { useState } from "react";
import { seatStatusClass, seatStatusLabel } from "../utils/seatStatus";
import { SeatStatusLegend } from "./SeatStatusLegend";

function directionLabel(direction: number): string {
  if (direction === 0) return "南下";
  if (direction === 1) return "北上";
  return "雙向";
}

function directionText(direction?: number): string {
  if (direction === undefined) return "方向待確認";
  return directionLabel(direction);
}

function formatTime(time?: string): string {
  if (!time) return "—";
  // API 回傳格式為 HH:mm:ss，介面僅顯示至分鐘
  return time.slice(0, 5);
}

function formatUpdatedAt(value?: string): string {
  return value ? new Date(value).toLocaleString("zh-TW") : "—";
}

function SeatBadge({ code, ariaLabel }: { code: string; ariaLabel: string }) {
  return (
    <span className={seatStatusClass(code)} title={`原始代碼: ${code}`} aria-label={ariaLabel}>
      {seatStatusLabel(code)}
    </span>
  );
}

function SeatRow({ seat }: { seat: AvailableSeat }) {
  return (
    <tr>
      <td>{seat.TrainNo}</td>
      <td>{formatTime(seat.DepartureTime)}</td>
      <td>{formatTime(seat.ArrivalTime)}</td>
      <td>
        <SeatBadge code={seat.StandardSeatStatus} ariaLabel={`標準席: ${seatStatusLabel(seat.StandardSeatStatus)}`} />
      </td>
      <td>
        <SeatBadge code={seat.BusinessSeatStatus} ariaLabel={`商務席: ${seatStatusLabel(seat.BusinessSeatStatus)}`} />
      </td>
    </tr>
  );
}

function isSoldOut(seat: AvailableSeat): boolean {
  return seat.StandardSeatStatus === "X" && seat.BusinessSeatStatus === "X";
}

type SeatTableRow =
  | { type: "seat"; seat: AvailableSeat }
  | { type: "sold-out-group"; seats: AvailableSeat[]; groupId: string };

function groupSoldOutSeats(seats: AvailableSeat[], keyPrefix: string, date: string): SeatTableRow[] {
  const rows: SeatTableRow[] = [];
  let soldOutGroup: AvailableSeat[] = [];

  const flushGroup = () => {
    if (soldOutGroup.length >= 2) {
      rows.push({
        type: "sold-out-group",
        seats: soldOutGroup,
        groupId: `${keyPrefix}-${date}-${soldOutGroup[0].TrainNo}`,
      });
    } else {
      soldOutGroup.forEach((seat) => rows.push({ type: "seat", seat }));
    }
    soldOutGroup = [];
  };

  seats.forEach((seat) => {
    if (isSoldOut(seat)) {
      soldOutGroup.push(seat);
    } else {
      flushGroup();
      rows.push({ type: "seat", seat });
    }
  });
  flushGroup();
  return rows;
}

function SoldOutGroupRow({ seats }: { seats: AvailableSeat[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="sold-out-summary-row">
        <td colSpan={5}>
          <button type="button" className="sold-out-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
            <span>{expanded ? "⌄" : "›"}</span>
            {expanded ? "收合" : "展開"} {seats.length} 個連續無座車次
            <span className="sold-out-trains">（{seats.map((seat) => seat.TrainNo).join("、")}）</span>
          </button>
        </td>
      </tr>
      {expanded && seats.map((seat) => <SeatRow key={`sold-out-${seat.TrainNo}`} seat={seat} />)}
    </>
  );
}

function DayResultSection({ keyPrefix, result }: { keyPrefix: string; result: DaySeatResult }) {
  const [trainQuery, setTrainQuery] = useState("");
  const [departureQuery, setDepartureQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const hasFilter = Boolean(trainQuery || departureQuery);
  const trainOptions = [...new Set(result.seats.map((seat) => seat.TrainNo))].sort();
  const departureOptions = [...new Set(result.seats.flatMap((seat) => seat.DepartureTime ? [seat.DepartureTime.slice(0, 5)] : []))].sort();
  const filteredSeats = result.seats.filter((seat) => {
    const matchesTrain = !trainQuery || seat.TrainNo.toLowerCase().includes(trainQuery.trim().toLowerCase());
    const departure = seat.DepartureTime?.slice(0, 5);
    const matchesDeparture = !departureQuery || Boolean(departure && departure.startsWith(departureQuery.trim()));
    return matchesTrain && matchesDeparture;
  });
  const tableRows = groupSoldOutSeats(filteredSeats, keyPrefix, result.date);
  const showTable = filteredSeats.length > 0 || showFilter;

  return (
    <section className="day-result">
      <div className="day-heading">
        <h3>{result.date}</h3>
        <button type="button" className="filter-toggle-button" onClick={() => {
          if (showFilter) {
            setTrainQuery("");
            setDepartureQuery("");
          }
          setShowFilter((value) => !value);
        }} aria-pressed={showFilter}>
          {showFilter ? "關閉篩選" : "篩選"}
        </button>
      </div>
      {result.error && <p className="day-error">查詢失敗：{result.error}</p>}
      {!result.error && filteredSeats.length === 0 && (
        <p className="day-empty">{hasFilter ? "沒有符合目前篩選條件的車次。" : "查無車次資料（可能尚未開賣、已無班次，或已被時間條件篩選掉）。"}</p>
      )}
      {!result.error && showTable && (
        <div className="seat-table-wrapper">
          <datalist id={`${keyPrefix}-${result.date}-train-options`}>{trainOptions.map((trainNo) => <option key={trainNo} value={trainNo} />)}</datalist>
          <datalist id={`${keyPrefix}-${result.date}-departure-options`}>{departureOptions.map((time) => <option key={time} value={time} />)}</datalist>
          <table className="seat-table">
            <thead>
              <tr>
                <th>{showFilter ? <input type="search" list={`${keyPrefix}-${result.date}-train-options`} placeholder="車次" value={trainQuery} onChange={(event) => setTrainQuery(event.target.value)} aria-label="篩選車次" /> : "車次"}</th>
                <th>{showFilter ? <input type="search" list={`${keyPrefix}-${result.date}-departure-options`} placeholder="發車時間" value={departureQuery} onChange={(event) => setDepartureQuery(event.target.value)} aria-label="篩選發車時間" /> : "發車時間"}</th>
                <th>抵達時間</th>
                <th>標準席</th>
                <th>商務席</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? <tr><td colSpan={5} className="table-empty-message">沒有符合目前篩選條件的車次。</td></tr> : tableRows.map((row) => row.type === "seat" ? (
                <SeatRow key={`${keyPrefix}-${result.date}-${row.seat.TrainNo}`} seat={row.seat} />
              ) : (
                <SoldOutGroupRow key={row.groupId} seats={row.seats} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.cachedAt && (
        <p className={`cache-hint result-freshness ${result.stale ? "cache-hint-stale" : ""}`}>
          {result.stale ? "TDX 暫時無法更新，顯示過期快取" : result.cached ? "來自本地快取" : "剛從 TDX 更新"}
          {` · 本地抓取 ${formatUpdatedAt(result.cachedAt)}`}
          {result.sourceUpdatedAt && ` · 高鐵來源 ${formatUpdatedAt(result.sourceUpdatedAt)}`}
          {result.tdxUpdatedAt && ` · TDX ${formatUpdatedAt(result.tdxUpdatedAt)}`}
        </p>
      )}
    </section>
  );
}

function DayResultGrid({ keyPrefix, results }: { keyPrefix: string; results: DaySeatResult[] }) {
  return (
    <div className="seat-results">
      {results.map((result) => (
        <DayResultSection key={`${keyPrefix}-${result.date}`} keyPrefix={keyPrefix} result={result} />
      ))}
    </div>
  );
}

interface SeatResultTableProps {
  legResults: LegSearchResult[];
}

export function SeatResultTable({ legResults }: SeatResultTableProps) {
  if (legResults.length === 0) return null;
  const showLegHeading = legResults.length > 1;
  return (
    <div className="seat-results-wrapper">
      <SeatStatusLegend />
      {legResults.map((leg, index) => (
        <TripLegResultBlock key={leg.legId} leg={leg} legIndex={index} showLegHeading={showLegHeading} />
      ))}
    </div>
  );
}

function TripLegResultBlock({ leg, legIndex, showLegHeading }: { leg: LegSearchResult; legIndex: number; showLegHeading: boolean }) {
  return (
    <div className="trip-leg-results">
      <h2 className="trip-leg-results-heading">
        {showLegHeading ? `行程 ${legIndex + 1}：` : ""}{leg.originLabel} → {leg.destinationLabel}
        <span className="direction-summary">· {directionText(leg.direction)}</span>
      </h2>
      {leg.error ? (
        <p className="day-error">查詢失敗：{leg.error}</p>
      ) : (
        <DayResultGrid keyPrefix={leg.legId} results={leg.results} />
      )}
    </div>
  );
}
