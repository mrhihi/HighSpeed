import type { DateInputMode } from "../types";

interface DateModeToggleProps {
  mode: DateInputMode;
  onChange: (mode: DateInputMode) => void;
  disabled?: boolean;
  /** radio input 的 name 屬性，多個行程同時顯示時務必給予不同的值避免互相干擾 */
  name?: string;
}

export function DateModeToggle({ mode, onChange, disabled, name = "date-mode" }: DateModeToggleProps) {
  return (
    <div className="date-mode-toggle" role="radiogroup" aria-label="日期查詢模式">
      <label>
        <input
          type="radio"
          name={name}
          checked={mode === "multi"}
          disabled={disabled}
          onChange={() => onChange("multi")}
        />
        自訂多個日期
      </label>
      <label>
        <input
          type="radio"
          name={name}
          checked={mode === "range"}
          disabled={disabled}
          onChange={() => onChange("range")}
        />
        日期範圍
      </label>
    </div>
  );
}
