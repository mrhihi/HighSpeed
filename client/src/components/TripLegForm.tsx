import { StationSelect } from "./StationSelect";
import { DateModeToggle } from "./DateModeToggle";
import { MultiDatePicker } from "./MultiDatePicker";
import { DateRangePicker } from "./DateRangePicker";
import type { Station, TripLeg } from "../types";
import { isTimeString } from "../utils/dates";
import { TimeInput } from "./TimeInput";

interface TripLegFormProps {
  leg: TripLeg;
  legIndex: number;
  stations: Station[];
  stationsDisabled: boolean;
  disabled: boolean;
  canRemove: boolean;
  onChange: (leg: TripLeg) => void;
  onRemove: () => void;
}

export function TripLegForm({
  leg,
  legIndex,
  stations,
  stationsDisabled,
  disabled,
  canRemove,
  onChange,
  onRemove,
}: TripLegFormProps) {
  const update = (patch: Partial<TripLeg>) => onChange({ ...leg, ...patch });

  return (
    <div className="trip-leg">
      <div className="trip-leg-header">
        <h2>行程 {legIndex + 1}</h2>
        <button
          type="button"
          className="remove-leg-button"
          onClick={onRemove}
          disabled={disabled || !canRemove}
          aria-label={`移除行程 ${legIndex + 1}`}
        >
          移除此行程
        </button>
      </div>

      <StationSelect
        stations={stations}
        originStationId={leg.originStationId}
        destinationStationId={leg.destinationStationId}
        onOriginChange={(id) => update({ originStationId: id })}
        onDestinationChange={(id) => update({ destinationStationId: id })}
        onSwap={() =>
          update({
            originStationId: leg.destinationStationId,
            destinationStationId: leg.originStationId,
          })
        }
        disabled={stationsDisabled || disabled}
      />
      {leg.originStationId &&
        leg.destinationStationId &&
        leg.originStationId === leg.destinationStationId && (
          <p className="status-message status-error">起站與迄站不可相同</p>
        )}

      <div className="date-section">
        <DateModeToggle
          mode={leg.dateMode}
          onChange={(mode) => update({ dateMode: mode })}
          disabled={disabled}
          name={`date-mode-${leg.id}`}
        />

        {leg.dateMode === "multi" ? (
          <MultiDatePicker
            dates={leg.multiDates}
            onChange={(dates) => update({ multiDates: dates })}
            disabled={disabled}
          />
        ) : (
          <DateRangePicker
            startDate={leg.rangeStart}
            endDate={leg.rangeEnd}
            onStartChange={(date) => update({ rangeStart: date })}
            onEndChange={(date) => update({ rangeEnd: date })}
            disabled={disabled}
          />
        )}

        <div className="time-range-fields">
          <label className="field time-filter-field">
            <span>最早出發時間（選填）</span>
            <TimeInput
              value={leg.minTime}
              disabled={disabled}
              ariaLabel="最早出發時間"
              onChange={(value) => update({ minTime: value })}
            />
          </label>
          <label className="field time-filter-field">
            <span>最晚出發時間（選填）</span>
            <TimeInput
              value={leg.maxTime}
              disabled={disabled}
              ariaLabel="最晚出發時間"
              onChange={(value) => update({ maxTime: value })}
            />
          </label>
        </div>
        {(leg.minTime && !isTimeString(leg.minTime)) || (leg.maxTime && !isTimeString(leg.maxTime)) ? (
          <p className="status-message status-error">時間請使用 24 小時制 HH:mm，例如 17:30</p>
        ) : null}
      </div>
    </div>
  );
}
