import { useState } from 'react';
import { formatDuration } from '../../utils/formatting';
import { delayToSeconds } from '../../utils/timeConversions';
import type { DelayUnit } from '../../utils/timeConversions';

interface AdvancedOptionsProps {
  expiration: string;           // datetime-local string or empty
  onExpirationChange: (value: string) => void;
  executionDelay: string;       // numeric string in current unit
  onExecutionDelayChange: (value: string) => void;
  delayUnit: DelayUnit;
  onDelayUnitChange: (unit: DelayUnit) => void;
  minExecutionDelay?: number;   // vault min in seconds, 0 = none
  /** When true, show the calldata textarea (send-quai mode) */
  showData?: boolean;
  data?: string;
  onDataChange?: (value: string) => void;
}

/**
 * Compute the minimum datetime-local value (now, rounded down to the minute).
 */
function getMinDatetime(): string {
  const now = new Date();
  // Round to current minute
  now.setSeconds(0, 0);
  // Offset for local timezone so toISOString slice gives local time
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function AdvancedOptions({
  expiration,
  onExpirationChange,
  executionDelay,
  onExecutionDelayChange,
  delayUnit,
  onDelayUnitChange,
  minExecutionDelay,
  showData,
  data,
  onDataChange,
}: AdvancedOptionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm font-mono text-dark-400 hover:text-dark-600 dark:hover:text-dark-300 flex items-center gap-1 transition-colors"
        aria-expanded={isOpen}
        aria-controls="advanced-options-content"
      >
        Advanced Options
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div id="advanced-options-content" className="mt-3 space-y-6">
          {/* Calldata (send-quai only) */}
          {showData && onDataChange && (
            <div>
              <label htmlFor="data" className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
                Data (Optional)
              </label>
              <textarea
                id="data"
                value={data}
                onChange={(e) => onDataChange(e.target.value)}
                placeholder="0x"
                rows={4}
                className="input-field w-full font-mono text-lg"
              />
              <p className="mt-2 text-base font-mono text-dark-600">
                Optional contract call data. Leave as "0x" for simple transfers.
              </p>
            </div>
          )}

          {/* Expiration — date & time picker */}
          <div>
            <label htmlFor="expiration" className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
              Expiration
            </label>
            <input
              id="expiration"
              type="datetime-local"
              value={expiration}
              onChange={(e) => onExpirationChange(e.target.value)}
              min={getMinDatetime()}
              className="input-field w-full"
            />
            <p className="mt-2 text-base font-mono text-dark-600">
              Leave empty for no expiration
            </p>
          </div>

          {/* Execution Delay — value + unit selector */}
          <div>
            <label htmlFor="executionDelay" className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
              Execution Delay
            </label>
            <div className="flex gap-2">
              <input
                id="executionDelay"
                type="number"
                min="0"
                step="1"
                value={executionDelay}
                onChange={(e) => onExecutionDelayChange(e.target.value)}
                placeholder="0"
                className="input-field flex-1"
              />
              <select
                value={delayUnit}
                onChange={(e) => onDelayUnitChange(e.target.value as DelayUnit)}
                className="input-field w-32 cursor-pointer"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            {minExecutionDelay != null && minExecutionDelay > 0 && (() => {
              const userDelay = delayToSeconds(executionDelay, delayUnit) ?? 0;
              const effectiveDelay = Math.max(minExecutionDelay, userDelay);
              return (
                <div className="mt-2 space-y-1">
                  <p className="text-base font-mono text-dark-600">
                    Vault minimum timelock: {formatDuration(minExecutionDelay)}
                  </p>
                  {userDelay > 0 && userDelay > minExecutionDelay && (
                    <p className="text-base font-mono text-primary-500">
                      Effective delay: {formatDuration(effectiveDelay)} (overrides vault minimum)
                    </p>
                  )}
                  {userDelay > 0 && userDelay <= minExecutionDelay && (
                    <p className="text-base font-mono text-dark-500">
                      Effective delay: {formatDuration(effectiveDelay)} (vault minimum applies)
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
