export function DataFreshnessNote() {
  return (
    <details className="data-freshness-note">
      <summary>
        <span className="data-freshness-icon" aria-hidden="true">↻</span>
        <span>
          <strong>API 資料更新可能有時間差</strong>
          <small>實際購票請以高鐵官方訂票系統為準</small>
        </span>
        <span className="data-freshness-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="data-freshness-content">
        <table className="data-freshness-table">
          <tbody>
            <tr>
              <th scope="row">資料來源</th>
              <td>交通部 TDX，不是高鐵官方訂票系統本身，票況可能不同步。</td>
            </tr>
            <tr>
              <th scope="row">未來日期</th>
              <td>
                通常每天約 10:00、16:00、22:00 更新。
                <span className="data-freshness-source-warning">更新時間由 TDX／高鐵資料來源決定；來源尚未更新時，本網站也無法取得較新的票況。</span>
              </td>
            </tr>
            <tr>
              <th scope="row">當日資料</th>
              <td>約每 10 分鐘更新。</td>
            </tr>
            <tr>
              <th scope="row">座位狀態</th>
              <td>
                <span className="seat-status-chip seat-status-chip-available"><b>O</b> 尚有座位</span>
                <span className="seat-status-chip seat-status-chip-limited"><b>L</b> 座位有限</span>
                <span className="seat-status-chip seat-status-chip-full"><b>X</b> 已無座位</span>
                <span className="data-freshness-inline-note">不是確切剩餘張數</span>
              </td>
            </tr>
            <tr>
              <th scope="row">購票建議</th>
              <td className="data-freshness-purchase-tip">
                <b>O</b> 可優先嘗試購票；<b>L</b> 建議立即到官方系統確認；<b>X</b> 可改查其他車次或分段行程。
                查詢結果僅供篩選，能否成功訂票仍以官方訂票系統為準。
              </td>
            </tr>
            <tr>
              <th scope="row">本網站快取</th>
              <td>使用 60 秒本地快取；可勾選「跳過 60 秒快取」重新抓取。</td>
            </tr>
            <tr>
              <th scope="row">營運異常</th>
              <td>若高鐵營運資料異常，座位狀態可能停留在最後正常資料；請以官方訂票系統或車站現場看板為準。</td>
            </tr>
            <tr>
              <th scope="row">官方說明</th>
              <td className="data-freshness-links">
                <a href="https://ptx.transportdata.tw/PTX/Announcement/Details/73dddb55-9780-4416-a047-53f877f01cd3" target="_blank" rel="noreferrer">TDX 高鐵剩餘位公告 ↗</a>
                <a href="https://motc-ptx-api-documentation.gitbook.io/motc-ptx-api-documentation/api-zi-liao-shi-yong-zhu-yi-shi-xiang/rail" target="_blank" rel="noreferrer">資料使用注意事項 ↗</a>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="data-freshness-warning">「座位有限」仍可能在官網訂不到票，實際購票請以高鐵官方票況為準。</p>
        <a href="https://tdx.transportdata.tw/data-service/basic?keyword=%E9%AB%98%E9%90%B5" target="_blank" rel="noreferrer">
          查看 TDX 高鐵資料服務 ↗
        </a>
      </div>
    </details>
  );
}
