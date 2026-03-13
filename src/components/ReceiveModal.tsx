import { QRCodeSVG } from 'qrcode.react';
import { Modal } from './Modal';
import { CopyButton } from './CopyButton';

interface ReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
}

export function ReceiveModal({ isOpen, onClose, walletAddress }: ReceiveModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receive" size="sm">
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="p-4 bg-white rounded-lg">
          <QRCodeSVG value={walletAddress} size={200} level="H" />
        </div>
        <div className="w-full">
          <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2 text-center">Vault Address</p>
          <div className="flex items-center gap-2 bg-dark-100 dark:bg-vault-dark-4 px-4 py-3 rounded-md border border-dark-300 dark:border-dark-600">
            <p className="text-sm font-mono text-primary-600 dark:text-primary-300 truncate flex-1">{walletAddress}</p>
            <CopyButton text={walletAddress} size="md" />
          </div>
        </div>
        <p className="text-sm text-dark-500 text-center">
          Send QUAI or tokens to this address to fund your vault.
        </p>
      </div>
    </Modal>
  );
}
