import { isPastDate, todayString } from "../utils/dates";

interface MultiDatePickerProps {
  dates: string[];
  onChange: (dates: string[]) => void;
  disabled?: boolean;
}

export function MultiDatePicker({ dates, onChange, disabled }: MultiDatePickerProps) {
  const today = todayString();
  const handleDateChange = (index: number, value: string) => {
    const next = [...dates];
    next[index] = value;
    onChange(next);
  };

  const handleAdd = () => {
    onChange([...dates, todayString()]);
  };

  const handleRemove = (index: number) => {
    onChange(dates.filter((_, i) => i !== index));
  };

  return (
    <div className="multi-date-picker">
      <div className="multi-date-list">
        {dates.map((date, index) => (
          <div className="multi-date-row" key={index}>
          <input
            type="date"
            value={date}
            className={isPastDate(date, today) ? "date-input-past" : ""}
            aria-invalid={isPastDate(date, today)}
            disabled={disabled}
            onChange={(e) => handleDateChange(index, e.target.value)}
          />
          <button
            type="button"
            className="remove-button"
            onClick={() => handleRemove(index)}
            disabled={disabled || dates.length <= 1}
            aria-label="移除此日期"
          >
            ✕
          </button>
          {isPastDate(date, today) && <span className="past-date-warning">日期已過期，無法查詢</span>}
          </div>
        ))}
        <button
          type="button"
          className="add-button add-date-button"
          onClick={handleAdd}
          disabled={disabled}
          aria-label="新增日期"
          title="新增日期"
        >
          ＋
        </button>
      </div>
    </div>
  );
}
