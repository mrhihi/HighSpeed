import { OfficialBookingLinks } from "./OfficialBookingLinks";

export function SeatStatusLegend() {
  return (
    <p className="seat-status-legend">
      座位狀態說明（高鐵僅提供等級燈號，非確切剩餘張數）：
      <span className="seat-status available">尚有座位</span>
      <span className="seat-status limited">座位有限</span>
      <span className="seat-status full">已無座位</span>
      <span className="seat-status-note">「座位有限」仍可能在官網訂不到票，請以高鐵官方票況為準。</span>
      <OfficialBookingLinks />
    </p>
  );
}
