import { parseUnits } from 'quais';

/**
 * Reading what a contract call would spend, from the raw argument values.
 *
 * The argument a value lives in depends on the function: `transfer(to, amount)`
 * puts the amount second, `transferFrom(from, to, amount)` third. Reading the
 * wrong position validates the wrong thing — checking a recipient address as
 * though it were an amount, or the ownership of a token nobody asked about.
 */

/**
 * Whether the call spends the vault's own ERC-20 balance.
 *
 * `transfer` always sends from the caller. `transferFrom` only touches the
 * vault when its `from` argument is the vault — but an unfilled `from` counts,
 * so the balance is shown while the user is still typing rather than appearing
 * only once the form is complete.
 */
export function isErc20SpendFromVault(
  functionName: string,
  argValues: Record<number, string>,
  walletAddress: string | undefined,
): boolean {
  if (functionName === 'transfer') return true;
  if (functionName === 'transferFrom') {
    const from = argValues[0]?.trim();
    if (!from || !walletAddress) return true;
    return from.toLowerCase() === walletAddress.toLowerCase();
  }
  return false;
}

export function isErc721TransferFunction(functionName: string): boolean {
  return functionName === 'transferFrom' || functionName === 'safeTransferFrom';
}

/**
 * The amount an ERC-20 spend would move, in base units, or null when it is not
 * yet given or not parseable.
 */
export function extractErc20Amount(
  functionName: string,
  argValues: Record<number, string>,
  decimals: number,
): bigint | null {
  let rawAmount: string | undefined;
  if (functionName === 'transfer') {
    rawAmount = argValues[1];
  } else if (functionName === 'transferFrom') {
    rawAmount = argValues[2];
  }
  if (!rawAmount || !rawAmount.trim()) return null;
  try {
    return parseUnits(rawAmount, decimals);
  } catch {
    return null;
  }
}

/** The token id an ERC-721 transfer would move, or null when not yet given. */
export function extractErc721TokenId(
  functionName: string,
  argValues: Record<number, string>,
): string | null {
  if (isErc721TransferFunction(functionName)) {
    const tokenId = argValues[2];
    return tokenId && tokenId.trim() ? tokenId.trim() : null;
  }
  return null;
}
