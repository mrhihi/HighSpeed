import { expandDateRange, isPastDate, todayString } from "../utils/dates";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  disabled?: boolean;
  maxDays?: number;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  disabled,
  maxDays = 27,
}: DateRangePickerProps) {
  const expanded = expandDateRange(startDate, endDate);
  const tooMany = expanded.length > maxDays;
  const today = todayString();
  const startPast = isPastDate(startDate, today);
  const endPast = isPastDate(endDate, today);

  return (
    <div className="date-range-picker">
      <div className="date-range-fields">
      <label className="field">
        <span>起始日期</span>
        <input
          type="date"
          value={startDate}
          className={startPast ? "date-input-past" : ""}
          aria-invalid={startPast}
          disabled={disabled}
          onChange={(e) => onStartChange(e.target.value)}
        />
        {startPast && <span className="past-date-warning">日期已過期，無法查詢</span>}
      </label>
      <label className="field">
        <span>結束日期</span>
        <input
          type="date"
          value={endDate}
          className={endPast ? "date-input-past" : ""}
          aria-invalid={endPast}
          disabled={disabled}
          onChange={(e) => onEndChange(e.target.value)}
        />
        {endPast && <span className="past-date-warning">日期已過期，無法查詢</span>}
      </label>
      </div>
      {expanded.length > 0 && (
        <p className={`range-hint ${tooMany ? "range-hint-warning" : ""}`}>
          共 {expanded.length} 天
          {tooMany
            ? `（提醒：高鐵僅開放當日起 ${maxDays} 天內的座位資料，超出範圍的日期可能查無資料）`
            : ""}
        </p>
      )}
    </div>
  );
}
