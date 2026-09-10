/**
 * TDX 高鐵剩餘座位狀態為「等級代碼」，並非確切剩餘張數（此為高鐵官方系統本身的限制）：
 * O = 尚有座位, L = 座位有限, X = 已無座位。
 * 若收到非預期的代碼，直接顯示原始文字作為保底。
 */
const SEAT_STATUS_LABELS: Record<string, string> = {
  O: "尚有座位",
  L: "座位有限",
  X: "已無座位",
};

export function seatStatusLabel(code: string): string {
  return SEAT_STATUS_LABELS[code] ?? code;
}

export function seatStatusClass(code: string): string {
  switch (code) {
    case "O":
      return "seat-status available";
    case "L":
      return "seat-status limited";
    case "X":
      return "seat-status full";
    default:
      return "seat-status unknown";
  }
}
