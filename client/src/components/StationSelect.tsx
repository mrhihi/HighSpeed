import type { Station } from "../types";

interface StationSelectProps {
  stations: Station[];
  originStationId: string;
  destinationStationId: string;
  onOriginChange: (stationId: string) => void;
  onDestinationChange: (stationId: string) => void;
  onSwap: () => void;
  disabled?: boolean;
}

function stationLabel(station: Station): string {
  return station.StationName?.Zh_tw ?? station.StationID;
}

export function StationSelect({
  stations,
  originStationId,
  destinationStationId,
  onOriginChange,
  onDestinationChange,
  onSwap,
  disabled,
}: StationSelectProps) {
  return (
    <div className="station-select">
      <label className="field">
        <span>起站</span>
        <select
          value={originStationId}
          disabled={disabled}
          onChange={(e) => onOriginChange(e.target.value)}
        >
          <option value="" disabled>
            請選擇起站
          </option>
          {stations.map((station) => (
            <option key={station.StationID} value={station.StationID}>
              {stationLabel(station)}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="swap-button"
        onClick={onSwap}
        disabled={disabled}
        aria-label="交換起訖站"
        title="交換起訖站"
      >
        ⇄
      </button>

      <label className="field">
        <span>迄站</span>
        <select
          value={destinationStationId}
          disabled={disabled}
          onChange={(e) => onDestinationChange(e.target.value)}
        >
          <option value="" disabled>
            請選擇迄站
          </option>
          {stations.map((station) => (
            <option key={station.StationID} value={station.StationID}>
              {stationLabel(station)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
