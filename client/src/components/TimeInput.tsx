import { useEffect, useRef, useState, type RefObject } from "react";

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
}

function normalizeTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (value.includes(":")) return value.replace(/[^\d:]/g, "").slice(0, 5);
  if (digits.length > 2) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return digits;
}

function splitTime(value: string): { hour: string; minute: string } {
  const [hour = "", minute = ""] = value.split(":");
  return { hour, minute };
}

export function TimeInput({ value, onChange, disabled, placeholder = "HH:mm", ariaLabel }: TimeInputProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoursScrollRef = useRef<HTMLDivElement>(null);
  const minutesScrollRef = useRef<HTMLDivElement>(null);
  const { hour, minute } = splitTime(value);
  const scrollOneStep = (ref: RefObject<HTMLDivElement | null>, direction: number) => {
    ref.current?.scrollBy({ left: direction * 43, behavior: "smooth" });
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const chooseHour = (nextHour: string) => {
    onChange(`${nextHour}:${minute || "00"}`);
  };

  const chooseMinute = (nextMinute: string) => {
    onChange(`${hour || "00"}:${nextMinute}`);
    setOpen(false);
  };

  return (
    <div className="time-input" ref={wrapperRef}>
      <div className="time-input-control">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={5}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onFocus={() => setOpen(true)}
          onChange={(event) => onChange(normalizeTimeInput(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        <button type="button" className="time-picker-button" onClick={() => setOpen((current) => !current)} disabled={disabled} aria-label={`${ariaLabel}開啟選擇器`} aria-expanded={open}>
          ▾
        </button>
      </div>
      {open && !disabled && (
        <div className="time-picker-popover" role="dialog" aria-label={`${ariaLabel}時間選擇器`}>
          <div className="time-picker-section">
            <span className="time-picker-label">小時</span>
            <div className="time-picker-scroll-row">
              <button type="button" className="time-picker-nav" onClick={() => scrollOneStep(hoursScrollRef, -1)} aria-label="小時往前一格">‹</button>
              <div className="time-picker-scroll" ref={hoursScrollRef} tabIndex={0} aria-label="選擇小時，可左右滑動">
                <div className="time-picker-options time-picker-hours">
                  {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((option, index) => (
                    <button type="button" key={option} className={`time-option ${index < 12 ? "before-noon" : "after-noon"} ${option === hour ? "selected" : ""}`} onClick={() => chooseHour(option)}>{option}</button>
                  ))}
                </div>
              </div>
              <button type="button" className="time-picker-nav" onClick={() => scrollOneStep(hoursScrollRef, 1)} aria-label="小時往後一格">›</button>
            </div>
          </div>
          <div className="time-picker-section">
            <span className="time-picker-label">分鐘（可用鍵盤輸入 01–59）</span>
            <div className="time-picker-scroll-row">
              <button type="button" className="time-picker-nav" onClick={() => scrollOneStep(minutesScrollRef, -1)} aria-label="分鐘往前一格">‹</button>
              <div className="time-picker-scroll" ref={minutesScrollRef} tabIndex={0} aria-label="選擇分鐘，可左右滑動">
                <div className="time-picker-options time-picker-minutes">
                  {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((option) => (
                    <button type="button" key={option} className={option === minute ? "time-option selected" : "time-option"} onClick={() => chooseMinute(option)}>{option}</button>
                  ))}
                </div>
              </div>
              <button type="button" className="time-picker-nav" onClick={() => scrollOneStep(minutesScrollRef, 1)} aria-label="分鐘往後一格">›</button>
            </div>
          </div>
          <button type="button" className="time-picker-clear" onClick={() => { onChange(""); setOpen(false); }}>清除時間</button>
        </div>
      )}
    </div>
  );
}
