import { useEffect, useState } from "react";
import { fetchSeatAvailability, fetchStations, fetchUsageStats, recordUsageEvent, type UsageStats } from "./api/client";
import { PurchasePlanner } from "./components/PurchasePlanner";
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import { TripLegForm } from "./components/TripLegForm";
import { SeatResultTable } from "./components/SeatResultTable";
import { LoadingErrorState } from "./components/LoadingErrorState";
import { SavedConditions } from "./components/SavedConditions";
import { expandDateRange, isPastDate, isTimeString, replaceTripLegDates, todayString } from "./utils/dates";
import type { LegSearchResult, Station, TripLeg } from "./types";
import "./App.css";

function createLegId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `leg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createLeg(overrides: Partial<TripLeg> = {}): TripLeg {
  return {
    id: createLegId(),
    originStationId: "",
    destinationStationId: "",
    dateMode: "multi",
    multiDates: [todayString()],
    rangeStart: todayString(),
    rangeEnd: todayString(),
    minTime: "",
    maxTime: "",
    ...overrides,
  };
}

function resolveDates(leg: TripLeg): string[] {
  if (leg.dateMode === "multi") {
    return Array.from(new Set(leg.multiDates.filter(Boolean)));
  }
  return expandDateRange(leg.rangeStart, leg.rangeEnd);
}

function stationLabel(stations: Station[], stationId: string): string {
  const station = stations.find((s) => s.StationID === stationId);
  return station?.StationName.Zh_tw ?? stationId;
}

interface TdxMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  inFlight: number;
  callsInLastMinute: number;
  maxRequestsPerMinute: number;
  minimumRequestIntervalMs: number;
  cooldownUntil: number | null;
}

function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsError, setStationsError] = useState<string | null>(null);
  const [stationsLoading, setStationsLoading] = useState(true);

  const [legs, setLegs] = useState<TripLeg[]>([createLeg()]);

  const [legResults, setLegResults] = useState<LegSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [skipCache, setSkipCache] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<"search" | "planner">("search");
  const [tdxMetrics, setTdxMetrics] = useState<TdxMetrics | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    fetchStations()
      .then((data) => {
        setStations(data);
        setStationsError(null);
      })
      .catch((err: unknown) => {
        setStationsError(err instanceof Error ? err.message : "無法取得車站清單");
      })
      .finally(() => setStationsLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchUsageStats().then((stats) => { if (!cancelled) setUsageStats(stats); }).catch(() => undefined);
    // React StrictMode 在開發環境會重跑 effect；同一個分頁只計一次瀏覽。
    const viewKey = "highspeed.view-recorded";
    if (!sessionStorage.getItem(viewKey)) {
      sessionStorage.setItem(viewKey, "1");
      recordUsageEvent("view").then((stats) => { if (!cancelled) setUsageStats(stats); }).catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let version = -1;
    const listenForMetrics = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}api/metrics/tdx/stream?since=${version}`, { signal: controller.signal });
          if (!response.ok) throw new Error("metrics stream unavailable");
          const metrics = await response.json() as TdxMetrics & { version: number };
          version = metrics.version;
          if (!cancelled) setTdxMetrics(metrics);
        } catch {
          if (!cancelled) await new Promise((resolve) => window.setTimeout(resolve, 3000));
        }
      }
    };
    listenForMetrics();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  const updateLeg = (id: string, next: TripLeg) => {
    setLegs((prev) => prev.map((leg) => (leg.id === id ? next : leg)));
  };

  const addLeg = () => {
    setLegs((prev) => {
      const last = prev[prev.length - 1];
      // 新增行程時預設把上一段的起訖站對調，方便輸入來回車次
      const suggested = last
        ? createLeg({
            originStationId: last.destinationStationId,
            destinationStationId: last.originStationId,
          })
        : createLeg();
      return [...prev, suggested];
    });
  };

  const removeLeg = (id: string) => {
    setLegs((prev) => (prev.length <= 1 ? prev : prev.filter((leg) => leg.id !== id)));
  };

  const legIsValid = (leg: TripLeg) =>
    Boolean(leg.originStationId) &&
    Boolean(leg.destinationStationId) &&
    leg.originStationId !== leg.destinationStationId &&
    (!leg.minTime || isTimeString(leg.minTime)) &&
    (!leg.maxTime || isTimeString(leg.maxTime)) &&
    resolveDates(leg).length > 0 &&
    resolveDates(leg).every((date) => !isPastDate(date));

  const canSearch = legs.length > 0 && legs.every(legIsValid) && !searchLoading;

  const handleSearch = async () => {
    if (!canSearch) return;
    const forceRefresh = skipCache;
    recordUsageEvent("query").then(setUsageStats).catch(() => undefined);
    setSearchLoading(true);
    setSearchError(null);
    setLegResults([]);

    const outcomes = await Promise.all(
      legs.map(async (leg): Promise<LegSearchResult> => {
        const originLabel = stationLabel(stations, leg.originStationId);
        const destinationLabel = stationLabel(stations, leg.destinationStationId);
        try {
          const response = await fetchSeatAvailability(
            leg.originStationId,
            leg.destinationStationId,
            resolveDates(leg),
            forceRefresh,
          );
          const minThreshold = leg.minTime ? `${leg.minTime}:00` : null;
          const maxThreshold = leg.maxTime ? `${leg.maxTime}:00` : null;
          const results = response.results.map((day) => ({
            ...day,
            // 沒有時間條件時保留未成功合併時刻表的車次；有時間條件時必須排除，
            // 否則無法確認是否落在區間內，可能誤顯示早於最早出發時間的車次。
            seats: day.seats.filter((seat) => {
              // 有時間條件時，沒有成功合併時刻表的車次無法確認是否在區間內；
              // 若保留它，會讓早於最早出發時間的車次誤出現在結果中。
              if (!seat.DepartureTime) return !minThreshold && !maxThreshold;
              if (minThreshold && seat.DepartureTime < minThreshold) return false;
              if (maxThreshold && seat.DepartureTime > maxThreshold) return false;
              return true;
            }),
          }));
          const direction = response.results
            .flatMap((day) => day.seats)
            .find((seat) => seat.Direction !== undefined)?.Direction;
          return { legId: leg.id, originLabel, destinationLabel, results, direction };
        } catch (err) {
          return {
            legId: leg.id,
            originLabel,
            destinationLabel,
            results: [],
            error: err instanceof Error ? err.message : "查詢失敗，請稍後再試",
          };
        }
      }),
    );

    setLegResults(outcomes);
    setSearchLoading(false);
    setSkipCache(false);
    if (outcomes.every((o) => o.error)) {
      setSearchError("所有行程查詢皆失敗，請稍後再試");
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <img className="app-logo" src={`${import.meta.env.BASE_URL}thsr.png`} alt="HighSpeed 高鐵列車圖示" />
        <div className="app-header-copy">
          <p className="app-kicker">HIGHSPEED · THSR</p>
          <h1>高鐵座位查詢與購票規劃</h1>
          <p className="subtitle">
            先查看即時座位狀態，再依票況選擇最適合的購票方式
          </p>
        </div>
      </header>

      <main className="app-main">
        {stationsError && <p className="status-message status-error">{stationsError}</p>}
        <WorkspaceTabs active={activeWorkspace} onChange={setActiveWorkspace} />
        <div className="search-workspace" role="tabpanel" aria-label="純查詢" hidden={activeWorkspace !== "search"}>
          <SavedConditions
            storageKey="highspeed.saved.search-conditions"
            value={legs}
            label="純查詢"
            onClear={() => {
              setLegResults([]);
              setSearchError(null);
              setLegs([createLeg()]);
            }}
            onLoad={(savedLegs) => {
              setLegResults([]);
              setLegs(savedLegs.map((leg) => ({ ...leg, id: createLegId() })));
            }}
            onLoadWithToday={(savedLegs) => {
              setLegResults([]);
              setLegs(replaceTripLegDates(savedLegs).map((leg) => ({ ...leg, id: createLegId() })));
            }}
          />
          <div className="workspace-heading">
            <div><p className="eyebrow">RAW AVAILABILITY</p><h2>純查詢</h2></div>
            <div className="workspace-heading-tools">
              <p>查看 TDX 原始對號座狀態，不自動組合購票方案。</p>
            </div>
          </div>
          <aside className="data-freshness-note" aria-label="TDX API 資料更新說明">
            <div className="data-freshness-icon" aria-hidden="true">↻</div>
            <div>
              <strong>API 資料更新可能有時間差</strong>
              <p>
                TDX 資料服務頁列出本查詢使用的高鐵資料 API；API 回傳的是 TDX 最近一次提供的資料，並不代表官方訂票系統的即時票況。
                因此查詢結果可能有同步時間差，實際購票請以官方訂票系統為準。本網站另會使用 60 秒本地快取；需要重新抓取時可勾選「跳過 60 秒快取」。
              </p>
              <a
                href="https://tdx.transportdata.tw/data-service/basic?keyword=%E9%AB%98%E9%90%B5"
                target="_blank"
                rel="noreferrer"
              >
                查看 TDX 高鐵資料服務 ↗
              </a>
            </div>
          </aside>
          <div className="search-form">
          {legs.map((leg, index) => (
            <TripLegForm
              key={leg.id}
              leg={leg}
              legIndex={index}
              stations={stations}
              stationsDisabled={stationsLoading || Boolean(stationsError)}
              disabled={searchLoading}
              canRemove={legs.length > 1}
              onChange={(next) => updateLeg(leg.id, next)}
              onRemove={() => removeLeg(leg.id)}
            />
          ))}

          <div className="search-actions">
            <button type="button" className="add-leg-button" onClick={addLeg} disabled={searchLoading}>
              ＋ 新增行程
            </button>
            <button type="button" className="search-button" onClick={handleSearch} disabled={!canSearch}>
              查詢座位
            </button>
            <label className="cache-toggle">
              <input
                type="checkbox"
                checked={skipCache}
                onChange={(event) => setSkipCache(event.target.checked)}
                disabled={searchLoading}
              />
              <span className="cache-toggle-slider" aria-hidden="true" />
              <span>跳過 60 秒快取</span>
            </label>
          </div>

          <LoadingErrorState loading={searchLoading} error={searchError} />
          </div>
          <SeatResultTable legResults={legResults} />
        </div>
        <div hidden={activeWorkspace !== "planner"}>
          <PurchasePlanner stations={stations} stationsLoading={stationsLoading} stationsError={stationsError} onUsageStats={setUsageStats} />
        </div>
      </main>
      <footer className="app-footer">
        <div className="data-source">
          <img src="https://www.opendata.vip/fe/img/tdxlogo.png" alt="TDX 開放資料平台" />
          <span>資料來源：交通部 TDX 運輸資料流通服務，實際票況請以官方訂票系統為準。</span>
        </div>
        {usageStats && (
          <div className="usage-stats" aria-label="網站使用統計">
            <span>瀏覽次數 <strong>{usageStats.views.toLocaleString()}</strong></span>
            <span>查詢次數 <strong>{usageStats.queries.toLocaleString()}</strong></span>
            <span>建議購票次數 <strong>{usageStats.recommendations.toLocaleString()}</strong></span>
          </div>
        )}
      </footer>
      {tdxMetrics && (
        <div className="tdx-metrics" aria-live="polite">
          <span className="tdx-metrics-dot" />
          <span>後台 TDX 呼叫</span>
          <strong>{tdxMetrics.totalCalls} 次</strong>
          <span>近 1 分鐘 {tdxMetrics.callsInLastMinute}/{tdxMetrics.maxRequestsPerMinute}</span>
          {tdxMetrics.inFlight > 0 && <span className="tdx-metrics-active">處理中 {tdxMetrics.inFlight}</span>}
          {tdxMetrics.cooldownUntil && <span className="tdx-metrics-cooldown">限流冷卻中</span>}
        </div>
      )}
    </div>
  );
}

export default App;
