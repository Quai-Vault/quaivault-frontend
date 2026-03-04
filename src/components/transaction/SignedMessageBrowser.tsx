import { Modal } from '../Modal';
import { useSignedMessages } from '../../hooks/useSignedMessages';

interface SignedMessageBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  onSelect: (messageBytes: string) => void;
}

export function SignedMessageBrowser({
  isOpen,
  onClose,
  walletAddress,
  onSelect,
}: SignedMessageBrowserProps) {
  const { data: messages, isLoading, error } = useSignedMessages(
    isOpen ? walletAddress : undefined
  );

  const handleSelect = (messageBytes: string) => {
    onSelect(messageBytes);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Signed Messages" size="lg">
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
          <p className="mt-4 text-sm text-dark-500 font-mono">Loading signed messages...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-sm text-red-500 font-mono">
            {error instanceof Error ? error.message : 'Failed to load signed messages'}
          </p>
        </div>
      )}

      {!isLoading && !error && (!messages || messages.length === 0) && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-dark-100 dark:bg-vault-dark-4 border border-dark-300 dark:border-dark-600 mb-4">
            <svg className="w-6 h-6 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm text-dark-500 font-mono">No signed messages found for this vault.</p>
        </div>
      )}

      {messages && messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((msg) => (
            <button
              key={msg.msgHash}
              type="button"
              onClick={() => handleSelect(msg.messageBytes)}
              className="w-full text-left p-4 rounded-md border border-dark-300 dark:border-dark-600 hover:border-primary-500 dark:hover:border-primary-400 bg-dark-100 dark:bg-vault-dark-4 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-dark-500 uppercase tracking-wider">
                  Hash
                </span>
                <span className="text-xs text-dark-500 font-mono">
                  {new Date(msg.signedAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm font-mono text-dark-700 dark:text-dark-200 break-all mb-2">
                {msg.msgHash.slice(0, 18)}...{msg.msgHash.slice(-8)}
              </p>
              <p className="text-xs font-mono text-dark-500 break-all">
                {msg.decodedText
                  ? `"${msg.decodedText.length > 100 ? msg.decodedText.slice(0, 100) + '...' : msg.decodedText}"`
                  : `${msg.messageBytes.slice(0, 42)}${msg.messageBytes.length > 42 ? '...' : ''}`}
              </p>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
