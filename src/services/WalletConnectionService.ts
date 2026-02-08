import { BrowserProvider } from 'quais';
import type { Provider, Signer } from '../types';

interface WalletState {
  connected: boolean;
  address: string | null;
  signer: Signer | null;
  provider: Provider | null;
}

export class WalletConnectionService {
  private state: WalletState = {
    connected: false,
    address: null,
    signer: null,
    provider: null,
  };

  private listeners: Set<(state: WalletState) => void> = new Set();

  // Store bound listener references to prevent memory leaks
  // (using arrow functions ensures same reference for add/remove)
  private boundAccountsChanged = (accounts: string[]) => this.handleAccountsChanged(accounts);
  private boundChainChanged = () => this.handleChainChanged();

  /**
   * Connect to Pelagus or other Quai-compatible wallet
   */
  async connect(): Promise<void> {
    try {
      // Check if Pelagus is installed
      if (!window.ethereum) {
        throw new Error('No Quai wallet found. Please install Pelagus wallet.');
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[] | undefined;

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Create provider with usePathing for Quai sharded architecture
      const provider = new BrowserProvider(
        window.ethereum,
        undefined
      );

      // Get signer
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      this.state = {
        connected: true,
        address,
        signer,
        provider,
      };

      this.notifyListeners();

      // Remove existing listeners before adding to prevent accumulation
      window.ethereum.removeListener('accountsChanged', this.boundAccountsChanged);
      window.ethereum.removeListener('chainChanged', this.boundChainChanged);
      window.ethereum.on('accountsChanged', this.boundAccountsChanged);
      window.ethereum.on('chainChanged', this.boundChainChanged);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  }

  /**
   * Silently reconnect if the wallet already has an authorized session.
   * Uses eth_accounts (no popup) instead of eth_requestAccounts.
   * Call this on app startup to restore the previous session.
   */
  async tryReconnect(): Promise<void> {
    if (!window.ethereum) return;

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_accounts',
      }) as string[] | undefined;

      if (!accounts || accounts.length === 0) return;

      const provider = new BrowserProvider(window.ethereum, undefined);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      this.state = {
        connected: true,
        address,
        signer,
        provider,
      };

      this.notifyListeners();

      // Remove existing listeners before adding to prevent accumulation
      window.ethereum.removeListener('accountsChanged', this.boundAccountsChanged);
      window.ethereum.removeListener('chainChanged', this.boundChainChanged);
      window.ethereum.on('accountsChanged', this.boundAccountsChanged);
      window.ethereum.on('chainChanged', this.boundChainChanged);
    } catch (error) {
      // Silent failure — user will see the normal "Connect Wallet" button
      console.warn('Auto-reconnect failed:', error);
    }
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    if (window.ethereum) {
      // Use stored bound references (same as added) to properly remove listeners
      window.ethereum.removeListener('accountsChanged', this.boundAccountsChanged);
      window.ethereum.removeListener('chainChanged', this.boundChainChanged);
    }

    this.state = {
      connected: false,
      address: null,
      signer: null,
      provider: null,
    };

    this.notifyListeners();
  }

  /**
   * Get current connection state
   */
  getState(): WalletState {
    return { ...this.state };
  }

  /**
   * Get connected address
   */
  getAddress(): string | null {
    return this.state.address;
  }

  /**
   * Get signer instance
   */
  getSigner(): Signer | null {
    return this.state.signer;
  }

  /**
   * Get provider instance
   */
  getProvider(): Provider | null {
    return this.state.provider;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.state.signer) {
      throw new Error('Wallet not connected');
    }

    return await this.state.signer.signMessage(message);
  }

  /**
   * Subscribe to wallet state changes
   */
  subscribe(listener: (state: WalletState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Handle account changes
   */
  private async handleAccountsChanged(accounts: string[]): Promise<void> {
    try {
      if (accounts.length === 0) {
        this.disconnect();
      } else {
        // Reconnect with new account
        await this.connect();
      }
    } catch (error) {
      console.error('Failed to handle account change:', error);
    }
  }

  /**
   * Handle chain changes
   */
  private handleChainChanged(): void {
    // Reload the page on chain change as recommended by MetaMask/Pelagus
    window.location.reload();
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }
}

// Singleton instance
export const walletConnectionService = new WalletConnectionService();

// EIP-1193 provider interface for typed wallet interactions
interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
