import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransactionModalFlow, useSimpleTransactionModalFlow } from './useTransactionModalFlow';

describe('useTransactionModalFlow', () => {
  it('starts closed with the flow hidden', () => {
    const { result } = renderHook(() => useTransactionModalFlow({ isOpen: true }));

    expect(result.current.showFlow).toBe(false);
  });

  it('shows the flow and bumps the reset key when started', () => {
    const { result } = renderHook(() => useTransactionModalFlow({ isOpen: true }));
    const before = result.current.resetKey;

    act(() => result.current.startFlow());

    expect(result.current.showFlow).toBe(true);
    expect(result.current.resetKey).not.toBe(before);
  });

  it('hides the flow again on resetFlow', () => {
    const { result } = renderHook(() => useTransactionModalFlow({ isOpen: true }));

    act(() => result.current.startFlow());
    act(() => result.current.resetFlow());

    expect(result.current.showFlow).toBe(false);
  });

  it('hides the flow when the modal closes', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useTransactionModalFlow({ isOpen }),
      { initialProps: { isOpen: true } }
    );

    act(() => result.current.startFlow());
    expect(result.current.showFlow).toBe(true);

    rerender({ isOpen: false });

    expect(result.current.showFlow).toBe(false);
  });

  describe('onBeforeClose', () => {
    it('runs when the modal goes from open to closed', () => {
      const onBeforeClose = vi.fn();
      const { rerender } = renderHook(
        ({ isOpen }) => useTransactionModalFlow({ isOpen, onBeforeClose }),
        { initialProps: { isOpen: true } }
      );

      rerender({ isOpen: false });

      expect(onBeforeClose).toHaveBeenCalledTimes(1);
    });

    // The inline effects this hook replaced also fired on mount while closed.
    // Callers use it to restore form defaults, which are already correct then.
    it('does not run on mount while closed', () => {
      const onBeforeClose = vi.fn();
      renderHook(() => useTransactionModalFlow({ isOpen: false, onBeforeClose }));

      expect(onBeforeClose).not.toHaveBeenCalled();
    });

    it('does not run on mount while open', () => {
      const onBeforeClose = vi.fn();
      renderHook(() => useTransactionModalFlow({ isOpen: true, onBeforeClose }));

      expect(onBeforeClose).not.toHaveBeenCalled();
    });

    it('uses the latest callback rather than the one from first render', () => {
      const first = vi.fn();
      const second = vi.fn();
      const { rerender } = renderHook(
        ({ isOpen, onBeforeClose }) => useTransactionModalFlow({ isOpen, onBeforeClose }),
        { initialProps: { isOpen: true, onBeforeClose: first } }
      );

      rerender({ isOpen: false, onBeforeClose: second });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  it('bumps the reset key again when reopened and restarted', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useTransactionModalFlow({ isOpen }),
      { initialProps: { isOpen: true } }
    );

    act(() => result.current.startFlow());
    const firstRun = result.current.resetKey;

    rerender({ isOpen: false });
    rerender({ isOpen: true });
    act(() => result.current.startFlow());

    expect(result.current.resetKey).not.toBe(firstRun);
  });
});

describe('useSimpleTransactionModalFlow', () => {
  it('bumps the key when the modal opens', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useSimpleTransactionModalFlow(isOpen),
      { initialProps: { isOpen: false } }
    );
    const before = result.current;

    rerender({ isOpen: true });

    expect(result.current).not.toBe(before);
  });

  it('keeps the key stable across re-renders while open', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useSimpleTransactionModalFlow(isOpen),
      { initialProps: { isOpen: false } }
    );

    rerender({ isOpen: true });
    const opened = result.current;
    rerender({ isOpen: true });

    expect(result.current).toBe(opened);
  });

  it('bumps the key again on each reopen', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useSimpleTransactionModalFlow(isOpen),
      { initialProps: { isOpen: false } }
    );

    rerender({ isOpen: true });
    const first = result.current;
    rerender({ isOpen: false });
    rerender({ isOpen: true });

    expect(result.current).not.toBe(first);
  });

  it('does not bump the key when closing', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useSimpleTransactionModalFlow(isOpen),
      { initialProps: { isOpen: true } }
    );
    const opened = result.current;

    rerender({ isOpen: false });

    expect(result.current).toBe(opened);
  });
});
