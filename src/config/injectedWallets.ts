/**
 * Injected-wallet detection for Quai.
 *
 * Pelagus does not own `window.ethereum`. Its content script defines the real
 * provider at `window.pelagus` (writable: false) and installs a
 * `window.walletRouter` whose `currentProvider` backs a `window.ethereum`
 * getter. `currentProvider` only points at Pelagus when the user has enabled
 * "default wallet" in the extension — which is off by default. So with
 * MetaMask/Phantom/Brave also installed, `window.ethereum` resolves to one of
 * those, and a generic injected connector opens the wrong wallet.
 *
 * Pelagus also does not announce itself over EIP-6963, so wagmi's multi-injected
 * provider discovery cannot find it either. `window.pelagus` is the only
 * reliable handle.
 *
 * The Blip Pay mobile app's in-app browser exposes its provider at
 * `window.pelagus` too, so both wallets are reached the same way.
 *
 * https://github.com/PelagusWallet/pelagus-extension/blob/main/src/window-provider.ts
 */

export const PELAGUS_ICON = 'https://pelaguswallet.io/docs/img/PelagusLogoSquare.png';
export const PELAGUS_INSTALL_URL = 'https://pelaguswallet.io/';

/** Dispatched on `window` once Pelagus has finished injecting. */
export const PELAGUS_READY_EVENT = 'quai#initialized';

export type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isPelagus?: boolean;
};

type InjectedWindow = {
  pelagus?: InjectedProvider;
  ethereum?: InjectedProvider;
};

/**
 * Read `window.ethereum` defensively. Pelagus installs it as a getter that
 * throws when `window.walletRouter` is missing, and other extensions can
 * install getters of their own.
 */
function readWindowEthereum(w: InjectedWindow): InjectedProvider | undefined {
  try {
    return w.ethereum;
  } catch {
    return undefined;
  }
}

/**
 * The Pelagus provider — extension or Blip Pay in-app browser — or undefined
 * when neither is present.
 *
 * Prefers `window.pelagus`. Falls back to `window.ethereum` only when it
 * self-identifies as Pelagus, which covers hosts that expose the provider
 * under the standard name without the extension's wallet router.
 */
export function getPelagusProvider(
  w: InjectedWindow | undefined = typeof window !== 'undefined'
    ? (window as unknown as InjectedWindow)
    : undefined
): InjectedProvider | undefined {
  if (!w) return undefined;
  if (w.pelagus) return w.pelagus;
  const ethereum = readWindowEthereum(w);
  return ethereum?.isPelagus ? ethereum : undefined;
}

/**
 * A non-Pelagus injected provider, or undefined when there isn't one.
 *
 * An escape hatch for wallets that expose only `window.ethereum`; note that on
 * Quai such a wallet may not be able to sign transactions at all. Deliberately
 * returns undefined when the provider is Pelagus — Pelagus and Blip Pay are
 * reached through {@link getPelagusProvider} instead.
 */
export function getGenericInjectedProvider(
  w: InjectedWindow | undefined = typeof window !== 'undefined'
    ? (window as unknown as InjectedWindow)
    : undefined
): InjectedProvider | undefined {
  if (!w) return undefined;
  const ethereum = readWindowEthereum(w);
  if (!ethereum || ethereum.isPelagus) return undefined;
  return ethereum;
}
