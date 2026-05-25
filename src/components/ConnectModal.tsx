import { useState } from 'react';
import { Modal } from './Modal';
import { useWallet } from '../hooks/useWallet';
import { useWalletStore } from '../store/walletStore';

const PELAGUS_ICON = 'https://pelaguswallet.io/docs/img/PelagusLogoSquare.png';

export function ConnectModal() {
  const open = useWalletStore((s) => s.connectModalOpen);
  const setOpen = useWalletStore((s) => s.setConnectModalOpen);
  const error = useWalletStore((s) => s.error);
  const { connectWith } = useWallet();
  const [busy, setBusy] = useState<'injected' | 'walletConnect' | null>(null);

  const handleClick = async (id: 'injected' | 'walletConnect') => {
    setBusy(id);
    try {
      await connectWith(id);
    } catch {
      // error already surfaced via the store; let the user retry or close
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Connect Wallet" size="sm">
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => handleClick('injected')}
          disabled={busy !== null}
          className="flex items-center gap-4 p-4 rounded-lg border-2 border-dark-200 dark:border-dark-700 hover:border-primary-500 dark:hover:border-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <img src={PELAGUS_ICON} alt="" className="w-10 h-10 rounded" />
          <div className="flex-1 text-left">
            <div className="font-semibold text-dark-800 dark:text-dark-100">Pelagus Wallet</div>
            <div className="text-xs text-dark-500 dark:text-dark-400">
              Browser extension
            </div>
          </div>
          {busy === 'injected' && (
            <span className="text-xs text-dark-500 dark:text-dark-400">Connecting…</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleClick('walletConnect')}
          disabled={busy !== null}
          className="flex items-center gap-4 p-4 rounded-lg border-2 border-dark-200 dark:border-dark-700 hover:border-primary-500 dark:hover:border-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="w-10 h-10 rounded bg-[#3b99fc] flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 40 40" fill="currentColor">
              <path d="M12.0883 14.5443C16.4554 10.2873 23.5446 10.2873 27.9117 14.5443L28.4313 15.0506C28.6498 15.2635 28.6498 15.6088 28.4313 15.8217L26.6531 17.5547C26.5438 17.6611 26.3666 17.6611 26.2574 17.5547L25.5422 16.8579C22.4965 13.8898 17.5035 13.8898 14.4578 16.8579L13.6925 17.6044C13.5832 17.7108 13.406 17.7108 13.2968 17.6044L11.5186 15.8714C11.3001 15.6585 11.3001 15.3132 11.5186 15.1003L12.0883 14.5443ZM31.6358 18.171L33.2189 19.7141C33.4374 19.9269 33.4374 20.2722 33.2189 20.4851L26.0884 27.435C25.8699 27.6479 25.5155 27.6479 25.297 27.435L20.2299 22.4944C20.1753 22.4412 20.0867 22.4412 20.0321 22.4944L14.9651 27.435C14.7466 27.6479 14.3922 27.6479 14.1737 27.435L7.04316 20.4847C6.82467 20.2718 6.82467 19.9265 7.04316 19.7136L8.6263 18.1705C8.84478 17.9576 9.19911 17.9576 9.41759 18.1705L14.485 23.1112C14.5396 23.1644 14.6282 23.1644 14.6828 23.1112L19.7497 18.1705C19.9682 17.9576 20.3226 17.9576 20.5411 18.1705L25.6086 23.1112C25.6632 23.1644 25.7518 23.1644 25.8064 23.1112L30.8735 18.171C31.0925 17.9582 31.4469 17.9582 31.6358 18.171Z" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <div className="font-semibold text-dark-800 dark:text-dark-100">WalletConnect</div>
            <div className="text-xs text-dark-500 dark:text-dark-400">
              Scan QR with a mobile or hardware wallet (e.g. Tangem)
            </div>
          </div>
          {busy === 'walletConnect' && (
            <span className="text-xs text-dark-500 dark:text-dark-400">Connecting…</span>
          )}
        </button>

        {error && (
          <div className="text-xs text-red-600 dark:text-red-400 px-1 pt-2">{error}</div>
        )}
      </div>
    </Modal>
  );
}
