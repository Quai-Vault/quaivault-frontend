import { describe, it, expect } from 'vitest';
import { getPelagusProvider, getGenericInjectedProvider } from './injectedWallets';
import type { InjectedProvider } from './injectedWallets';

const provider = (extra: Partial<InjectedProvider> = {}): InjectedProvider => ({
  request: async () => undefined,
  ...extra,
});

/** A `window.ethereum` that throws on access, as Pelagus's getter can. */
function windowWithThrowingEthereum(pelagus?: InjectedProvider) {
  const w = { pelagus };
  Object.defineProperty(w, 'ethereum', {
    get() {
      throw new Error('window.walletRouter is expected to be set');
    },
  });
  return w as { pelagus?: InjectedProvider; ethereum?: InjectedProvider };
}

describe('getPelagusProvider', () => {
  it('returns window.pelagus when present', () => {
    const pelagus = provider({ isPelagus: true });
    expect(getPelagusProvider({ pelagus })).toBe(pelagus);
  });

  it('prefers window.pelagus over a foreign window.ethereum', () => {
    // The reported bug: with MetaMask/Phantom/Brave installed, window.ethereum
    // is routed to one of them, so it must never win over window.pelagus.
    const pelagus = provider({ isPelagus: true });
    const metamask = provider();
    expect(getPelagusProvider({ pelagus, ethereum: metamask })).toBe(pelagus);
  });

  it('falls back to window.ethereum when it self-identifies as Pelagus', () => {
    const ethereum = provider({ isPelagus: true });
    expect(getPelagusProvider({ ethereum })).toBe(ethereum);
  });

  it('returns undefined when only a foreign window.ethereum is present', () => {
    expect(getPelagusProvider({ ethereum: provider() })).toBeUndefined();
  });

  it('returns undefined when nothing is injected', () => {
    expect(getPelagusProvider({})).toBeUndefined();
  });

  it('does not throw when the window.ethereum getter throws', () => {
    expect(getPelagusProvider(windowWithThrowingEthereum())).toBeUndefined();
  });

  it('still finds window.pelagus when the window.ethereum getter throws', () => {
    const pelagus = provider({ isPelagus: true });
    expect(getPelagusProvider(windowWithThrowingEthereum(pelagus))).toBe(pelagus);
  });
});

describe('getGenericInjectedProvider', () => {
  it('returns a non-Pelagus injected provider', () => {
    const ethereum = provider();
    expect(getGenericInjectedProvider({ ethereum })).toBe(ethereum);
  });

  it('returns undefined when window.ethereum is Pelagus', () => {
    // That wallet is reached through the Pelagus entry instead, so the generic
    // option must not appear as a duplicate.
    expect(getGenericInjectedProvider({ ethereum: provider({ isPelagus: true }) })).toBeUndefined();
  });

  it('returns undefined when nothing is injected', () => {
    expect(getGenericInjectedProvider({})).toBeUndefined();
  });

  it('does not throw when the window.ethereum getter throws', () => {
    expect(getGenericInjectedProvider(windowWithThrowingEthereum())).toBeUndefined();
  });
});
