import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

const NOW_MS = 1_700_000_000_000;
const nowSeconds = () => NOW_MS / 1000;

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the seconds remaining up front', () => {
    const { result } = renderHook(() => useCountdown(nowSeconds() + 60));

    expect(result.current).toBe(60);
  });

  it('ticks down as time passes', () => {
    const { result } = renderHook(() => useCountdown(nowSeconds() + 60));

    act(() => { vi.advanceTimersByTime(5_000); });

    expect(result.current).toBe(55);
  });

  // The bug this hook exists to fix: a value read during render never updates,
  // so a countdown freezes and "ready" never appears.
  it('reaches zero on its own without any other re-render', () => {
    const { result } = renderHook(() => useCountdown(nowSeconds() + 3));

    act(() => { vi.advanceTimersByTime(3_000); });

    expect(result.current).toBe(0);
  });

  it('floors at zero rather than going negative', () => {
    const { result } = renderHook(() => useCountdown(nowSeconds() + 2));

    act(() => { vi.advanceTimersByTime(10_000); });

    expect(result.current).toBe(0);
  });

  it('starts at zero for a target already in the past', () => {
    const { result } = renderHook(() => useCountdown(nowSeconds() - 100));

    expect(result.current).toBe(0);
  });

  describe('onElapsed', () => {
    it('fires once when the countdown reaches zero', () => {
      const onElapsed = vi.fn();
      renderHook(() => useCountdown(nowSeconds() + 2, onElapsed));

      expect(onElapsed).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(2_000); });
      expect(onElapsed).toHaveBeenCalledTimes(1);

      act(() => { vi.advanceTimersByTime(5_000); });
      expect(onElapsed).toHaveBeenCalledTimes(1);
    });

    it('fires immediately for a target already in the past', () => {
      const onElapsed = vi.fn();
      renderHook(() => useCountdown(nowSeconds() - 1, onElapsed));

      expect(onElapsed).toHaveBeenCalledTimes(1);
    });
  });

  it('re-seeds when the target moves rather than continuing the old count', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountdown(target),
      { initialProps: { target: nowSeconds() + 10 } }
    );

    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).toBe(5);

    rerender({ target: nowSeconds() + 100 });

    expect(result.current).toBe(95);
  });

  it('stops ticking once unmounted', () => {
    const { result, unmount } = renderHook(() => useCountdown(nowSeconds() + 60));
    const atUnmount = result.current;

    unmount();
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(result.current).toBe(atUnmount);
  });
});
