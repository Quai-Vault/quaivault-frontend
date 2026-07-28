import { useState, useEffect, useRef } from 'react';

/**
 * Seconds remaining until `targetSeconds` (a unix timestamp), ticking once a
 * second and floored at zero.
 *
 * Reading the clock during render is impure — the value goes stale and nothing
 * re-renders to correct it, so a countdown freezes and never reaches "ready".
 *
 * The clock itself is the only state here; the remaining time is derived from
 * it. That keeps render pure, and means a moved target is picked up for free
 * rather than needing the stored count to be re-seeded.
 */
export function useCountdown(targetSeconds: number, onElapsed?: () => void): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const secondsLeft = Math.max(0, Math.ceil(targetSeconds - nowMs / 1000));
  const hasElapsed = secondsLeft <= 0;

  // Nothing left to count, so no interval is started — a view showing only
  // elapsed timers costs nothing.
  useEffect(() => {
    if (hasElapsed) return;

    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasElapsed]);

  const onElapsedRef = useRef(onElapsed);
  useEffect(() => { onElapsedRef.current = onElapsed; }, [onElapsed]);

  const hasFiredRef = useRef(false);
  useEffect(() => {
    if (!hasElapsed) {
      // The target moved into the future; re-arm for the next elapse.
      hasFiredRef.current = false;
      return;
    }
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    onElapsedRef.current?.();
  }, [hasElapsed]);

  return secondsLeft;
}
