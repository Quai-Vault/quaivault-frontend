import { useQuery } from '@tanstack/react-query';
import { Contract as QuaisContract, Interface, keccak256, toUtf8String } from 'quais';
import { indexerService } from '../services/indexer';
import { getActiveProvider, hasWalletProvider } from '../config/provider';
import { INDEXER_CONFIG } from '../config/supabase';
import QuaiVaultABI from '../config/abi/QuaiVault.json';

export interface SignedMessage {
  msgHash: string;
  messageBytes: string;
  decodedText: string | null;
  signedAt: string;
}

const quaiVaultInterface = new Interface(QuaiVaultABI.abi);
const SIGN_MESSAGE_SELECTOR = quaiVaultInterface.getFunction('signMessage')!.selector.toLowerCase();

function tryDecodeUtf8(hexBytes: string): string | null {
  try {
    const text = toUtf8String(hexBytes);
    // Reject if it contains control characters (not readable text)
    if (/[\x00-\x08\x0e-\x1f]/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

async function fetchSignedMessages(walletAddress: string): Promise<SignedMessage[]> {
  // Step 1: Query executed transactions from indexer
  const result = await indexerService.transaction.getTransactionHistory(
    walletAddress,
    { limit: 100 }
  );

  console.log('[SignedMessages] Indexer returned', result.data.length, 'transactions');

  // Step 2: Filter to executed signMessage self-calls
  const signMessageTxs = result.data.filter((tx) => {
    const data = tx.data ?? '';
    return (
      tx.status === 'executed' &&
      tx.to_address.toLowerCase() === tx.wallet_address.toLowerCase() &&
      data.toLowerCase().startsWith(SIGN_MESSAGE_SELECTOR)
    );
  });

  console.log('[SignedMessages] Filtered to', signMessageTxs.length, 'signMessage self-calls');

  // Step 3: Decode calldata to extract original message bytes
  const candidates = new Map<string, SignedMessage>();

  for (const tx of signMessageTxs) {
    try {
      const decoded = quaiVaultInterface.decodeFunctionData('signMessage', tx.data!);
      const messageBytes: string = decoded[0];
      const msgHash = keccak256(messageBytes);

      // Deduplicate by hash — keep the earliest signing
      if (!candidates.has(msgHash)) {
        candidates.set(msgHash, {
          msgHash,
          messageBytes,
          decodedText: tryDecodeUtf8(messageBytes),
          signedAt: tx.created_at,
        });
      }
    } catch {
      // Skip transactions we can't decode
    }
  }

  console.log('[SignedMessages] Decoded', candidates.size, 'candidates');
  if (candidates.size === 0) return [];

  // Step 4: Verify on-chain which are still signed
  // The contract hashes messages via getMessageHash (EIP-712 encoding),
  // not a plain keccak256, so we must call getMessageHash on-chain.
  const provider = getActiveProvider();
  const contract = new QuaisContract(walletAddress, QuaiVaultABI.abi, provider);

  const verified: SignedMessage[] = [];
  for (const entry of candidates.values()) {
    try {
      const msgHash: string = await contract.getMessageHash(entry.messageBytes);
      const isSigned = await contract.signedMessages(msgHash);
      console.log('[SignedMessages] On-chain check for', msgHash, '→', isSigned, typeof isSigned);
      if (isSigned) {
        // Update entry with the actual on-chain hash
        entry.msgHash = msgHash;
        verified.push(entry);
      }
    } catch (e) {
      console.error('[SignedMessages] On-chain check failed for', entry.msgHash, e);
    }
  }

  console.log('[SignedMessages] Verified', verified.length, 'of', candidates.size, 'candidates');
  return verified;
}

export function useSignedMessages(walletAddress?: string) {
  return useQuery<SignedMessage[]>({
    queryKey: ['signedMessages', walletAddress],
    queryFn: () => fetchSignedMessages(walletAddress!),
    enabled: !!walletAddress && INDEXER_CONFIG.ENABLED && hasWalletProvider(),
    staleTime: 30_000,
  });
}
