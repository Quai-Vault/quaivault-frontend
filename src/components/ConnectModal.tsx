import { useState } from 'react';
import { Modal } from './Modal';
import { useWallet } from '../hooks/useWallet';
import { useWalletStore } from '../store/walletStore';

const PELAGUS_ICON = 'https://pelaguswallet.io/docs/img/PelagusLogoSquare.png';

function BlipPayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
      <path fill="#C1ED00" d="m99.9 17.4c-2.8-5.7-9.3-10.5-19.7-10.5-6.7 0-14.6 1.4-20.2 7.3l-0.6 0.5c-2.8-1.5-6.4-2.7-11.7-2.7-6.3 0-12.8 1.9-17.6 7.1-3.1-1.4-6.6-2.3-11.3-2.3-8.7 0-16.1 3.7-18.8 9.8v29.2c2.5 6.7 8.8 14.1 14.7 18.6 9.8 7.7 25.2 14.5 45.3 17.7 12.2 1.8 25.5-3.3 25.4-14.9v-3.8c4.2-2 8.4-6.5 8.4-12.8v-5.3c2.3-1.4 4.8-3.7 6.2-7.1l-0.1-30.8z" />
      <path fill="#0F1116" d="m98.3 24.4c0-7.2-6.9-13.9-18.2-13.9-7.1-0.1-15.7 2-19.8 8.6-2.6-1.8-6.3-3.9-12.6-3.9-6.8 0-13.4 2.5-16.8 8.2-3.2-1.9-6.5-3.2-12.1-3.2-8.9 0-16.8 4.4-16.8 11.7v19.9c2.4 9.2 14.2 26 47.5 34.9 3.9 0.9 9.1 1.9 12.6 2.4 7.3 0.7 17.8-1.5 19.7-9.6 0.4-1.8 0-8.5 0.2-8.5 2.6-0.6 7.9-3.7 8.6-9.3v-8.4c3.2-1.3 7.7-4.8 7.7-10.2v-18.7z" />
      <path fill="#C1ED00" d="m58.4 26.6c-1.3-3.5-6.5-5.1-10.7-5-6.3 0-12.5 2.9-11.1 7 2.5 6.9 11.1 15.4 25.9 18.6 3.7 0.9 7.6 1.4 10.9 1.5 10.1 0 14-7 7.7-10.5-3.3-1.8-5.7-1.6-7.7-2-5.7-0.8-12.7-3.6-15-9.6zm-28.8 4.3c-1.5-2.7-6-4.6-10.8-4.6-6.7 0-12.5 3.2-10.9 7.3 3 8 13.7 20.3 35.6 26.9 4.9 1.6 11.1 2.9 16 3.7 12 2 19.6-3.7 15-8-2.9-2.4-5.9-2.7-7.8-3-13.2-1.6-32.1-8.6-37.1-22.3zm49.3-14.1c-7.8 0-13.7 3.6-13.7 7.4 0 2.9 3.9 7.2 13.2 7.3 8.2 0 14-3.3 14-7.1 0.1-3.2-4-7.4-13.5-7.6z" />
    </svg>
  );
}

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
          <div className="flex -space-x-2 flex-shrink-0">
            <img src={PELAGUS_ICON} alt="" className="w-10 h-10 rounded ring-2 ring-white dark:ring-vault-dark-2 relative z-10" />
            <BlipPayIcon className="w-10 h-10 rounded bg-white ring-2 ring-white dark:ring-vault-dark-2 p-1" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-semibold text-dark-800 dark:text-dark-100">Pelagus or Blip Pay</div>
            <div className="text-xs text-dark-500 dark:text-dark-400">
              Pelagus browser extension or Blip Pay mobile app
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
