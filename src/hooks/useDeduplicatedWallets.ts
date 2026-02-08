import { useMemo } from 'react';

/**
 * Deduplicate wallets where user is both owner and guardian.
 * Returns guardian-only wallets and a set of dual-role addresses.
 */
export function useDeduplicatedWallets(
  userWallets: string[] | undefined,
  guardianWallets: string[] | undefined
) {
  return useMemo(() => {
    const ownerSet = new Set((userWallets || []).map(a => a.toLowerCase()));
    const dualRole = new Set<string>();
    const guardianOnly: string[] = [];

    for (const addr of guardianWallets || []) {
      if (ownerSet.has(addr.toLowerCase())) {
        dualRole.add(addr.toLowerCase());
      } else {
        guardianOnly.push(addr);
      }
    }

    return { guardianOnlyWallets: guardianOnly, dualRoleAddresses: dualRole };
  }, [userWallets, guardianWallets]);
}
