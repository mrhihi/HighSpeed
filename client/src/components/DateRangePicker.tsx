import { expandDateRange } from "../utils/dates";

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

  return (
    <div className="date-range-picker">
      <label className="field">
        <span>起始日期</span>
        <input
          type="date"
          value={startDate}
          disabled={disabled}
          onChange={(e) => onStartChange(e.target.value)}
        />
      </label>
      <label className="field">
        <span>結束日期</span>
        <input
          type="date"
          value={endDate}
          disabled={disabled}
          onChange={(e) => onEndChange(e.target.value)}
        />
      </label>
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
