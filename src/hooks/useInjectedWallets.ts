import { useEffect, useState } from 'react';
import {
  PELAGUS_READY_EVENT,
  getPelagusProvider,
  getGenericInjectedProvider,
} from '../config/injectedWallets';

export interface InjectedWallets {
  /** Pelagus is available at `window.pelagus`. */
  pelagus: boolean;
  /** A non-Pelagus injected provider is available (e.g. a Blip Pay in-app browser). */
  otherInjected: boolean;
}

function detect(): InjectedWallets {
  return {
    pelagus: getPelagusProvider() !== undefined,
    otherInjected: getGenericInjectedProvider() !== undefined,
  };
}

// Extensions normally inject at document_start, but React can mount first.
// Re-check on a short schedule in addition to the readiness event.
const RECHECK_DELAYS_MS = [100, 300, 1000];

/**
 * Which injected wallets are present right now.
 *
 * Pelagus signals readiness with its own `quai#initialized` event rather than
 * the `ethereum#initialized` that wagmi's `unstable_shimAsyncInject` listens
 * for, so detection is handled here instead of in the connector.
 */
export function useInjectedWallets(): InjectedWallets {
  const [wallets, setWallets] = useState<InjectedWallets>(detect);

  useEffect(() => {
    let cancelled = false;

    const recheck = () => {
      if (cancelled) return;
      const next = detect();
      setWallets((prev) =>
        prev.pelagus === next.pelagus && prev.otherInjected === next.otherInjected
          ? prev
          : next
      );
    };

    window.addEventListener(PELAGUS_READY_EVENT, recheck);
    const timers = RECHECK_DELAYS_MS.map((delay) => setTimeout(recheck, delay));
    recheck();

    return () => {
      cancelled = true;
      window.removeEventListener(PELAGUS_READY_EVENT, recheck);
      timers.forEach(clearTimeout);
    };
  }, []);

  return wallets;
}
