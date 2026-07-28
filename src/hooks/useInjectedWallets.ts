import { useEffect, useState } from 'react';
import {
  PELAGUS_READY_EVENT,
  getPelagusProvider,
  getGenericInjectedProvider,
} from '../config/injectedWallets';

export interface InjectedWallets {
  /** Pelagus or Blip Pay is available at `window.pelagus`. */
  pelagus: boolean;
  /** An injected provider that is neither Pelagus nor Blip Pay is available. */
  otherInjected: boolean;
}

// Covers hosts that expose `window.pelagus` without dispatching Pelagus's
// readiness event, and the gap between render and effect commit where the
// event could fire before the listener below is attached.
const FALLBACK_RECHECK_MS = 500;

/**
 * Which injected wallets are present right now.
 *
 * Pelagus signals readiness with its own `quai#initialized` event rather than
 * the `ethereum#initialized` that wagmi's `unstable_shimAsyncInject` listens
 * for, so detection is handled here instead of in the connector.
 */
export function useInjectedWallets(): InjectedWallets {
  const [pelagus, setPelagus] = useState(() => getPelagusProvider() !== undefined);
  const [otherInjected, setOtherInjected] = useState(
    () => getGenericInjectedProvider() !== undefined
  );

  useEffect(() => {
    const recheck = () => {
      setPelagus(getPelagusProvider() !== undefined);
      setOtherInjected(getGenericInjectedProvider() !== undefined);
    };

    window.addEventListener(PELAGUS_READY_EVENT, recheck);
    const timer = setTimeout(recheck, FALLBACK_RECHECK_MS);

    return () => {
      window.removeEventListener(PELAGUS_READY_EVENT, recheck);
      clearTimeout(timer);
    };
  }, []);

  return { pelagus, otherInjected };
}
