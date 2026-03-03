import { useState, useEffect } from 'react';
import { formatDuration } from '../utils/formatting';

interface TimelockCountdownProps {
  /** Unix timestamp (seconds) when execution becomes available */
  executableAfter: number;
}

export function TimelockCountdown({ executableAfter }: TimelockCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil(executableAfter - Date.now() / 1000))
  );

  useEffect(() => {
    if (secondsLeft <= 0) return;

    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(executableAfter - Date.now() / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [executableAfter, secondsLeft <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const readyDate = new Date(executableAfter * 1000);
  const formattedDate = readyDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: readyDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
  const formattedTime = readyDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (secondsLeft <= 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center px-3 py-1.5 rounded text-base font-semibold bg-gradient-to-r from-primary-700 to-primary-800 text-primary-200 border border-primary-600 shadow-red-glow animate-pulse-slow">
          <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Timelock elapsed
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center px-3 py-1.5 rounded text-base font-semibold bg-gradient-to-r from-yellow-700 to-yellow-800 text-yellow-200 border border-yellow-600 shadow-vault-inner">
        <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
        Timelocked &middot; {formatDuration(secondsLeft)}
      </span>
      <span className="text-sm font-mono text-dark-500 dark:text-dark-400 pl-1">
        Executable {formattedDate} at {formattedTime}
      </span>
    </div>
  );
}
