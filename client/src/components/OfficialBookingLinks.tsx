const THSR_BOOKING_URL = "https://irs.thsrc.com.tw/IMINT";
const THSR_IOS_APP_URL = "https://apps.apple.com/tw/app/id468963664";
const THSR_ANDROID_APP_URL = "https://play.google.com/store/apps/details?id=tw.com.thsrc.texpress";

function thsrAppUrl(): string {
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)) return THSR_ANDROID_APP_URL;
  return THSR_IOS_APP_URL;
}

export function OfficialBookingLinks() {
  return (
    <>
      <a className="thsr-booking-link" href={THSR_BOOKING_URL} target="_blank" rel="noreferrer">前往高鐵官方購票 ↗</a>
      <a className="thsr-app-link" href={thsrAppUrl()} target="_blank" rel="noreferrer">開啟／下載 T-EX App ↗</a>
    </>
  );
}
