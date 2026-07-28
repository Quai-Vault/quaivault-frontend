import { describe, it, expect, afterEach } from 'vitest';
import { wagmiConfig, CONNECTOR_IDS } from './wagmi';

const win = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete win.pelagus;
  delete win.ethereum;
});

describe('wagmi connectors', () => {
  it('registers a dedicated Pelagus connector alongside injected and WalletConnect', () => {
    const ids = wagmiConfig.connectors.map((c) => c.id);
    expect(ids).toContain(CONNECTOR_IDS.pelagus);
    expect(ids).toContain(CONNECTOR_IDS.injected);
    expect(ids).toContain(CONNECTOR_IDS.walletConnect);
  });

  it('binds the Pelagus connector to window.pelagus, not window.ethereum', async () => {
    // With other wallets installed, Pelagus routes window.ethereum to one of
    // them. The Pelagus connector must ignore it entirely.
    const pelagus = { request: async () => undefined, isPelagus: true };
    const metamask = { request: async () => undefined, isMetaMask: true };
    win.pelagus = pelagus;
    win.ethereum = metamask;

    const pelagusConnector = wagmiConfig.connectors.find((c) => c.id === CONNECTOR_IDS.pelagus);
    const injectedConnector = wagmiConfig.connectors.find((c) => c.id === CONNECTOR_IDS.injected);

    expect(await pelagusConnector?.getProvider()).toBe(pelagus);
    expect(await injectedConnector?.getProvider()).toBe(metamask);
  });

  it('does not fall back to window.ethereum when Pelagus is absent', async () => {
    // Guards the object-vs-function target invariant: wagmi silently swaps in
    // its `window.ethereum` default target when a *function* target returns
    // undefined, which would reintroduce the wrong-wallet bug.
    win.ethereum = { request: async () => undefined, isMetaMask: true };

    const pelagusConnector = wagmiConfig.connectors.find((c) => c.id === CONNECTOR_IDS.pelagus);

    expect(pelagusConnector?.id).toBe('pelagus');
    expect(await pelagusConnector?.getProvider()).toBeUndefined();
  });
});
