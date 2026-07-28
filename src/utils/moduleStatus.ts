/**
 * Deciding which module status changes are worth notifying about.
 *
 * Split out from the notification effect so the rule that matters can be
 * tested directly: a status of `null` means the on-chain check failed, not
 * that the module is disabled. Treating unknown as a value made a transient
 * RPC failure announce "module disabled", then "module enabled" again when the
 * next poll succeeded — two false alarms, one of them an OS-level notification,
 * about a security-relevant module.
 */

export interface ModuleStatusChange {
  moduleAddress: string;
  isEnabled: boolean;
}

export interface ModuleStatusDiff {
  /** Transitions to announce. Empty on first sight of a module. */
  changes: ModuleStatusChange[];
  /**
   * Statuses to carry forward. Known values only, so an unknown reading never
   * becomes the baseline a later change is compared against.
   */
  nextStatuses: Record<string, boolean>;
}

export function diffModuleStatuses(
  prevStatuses: Record<string, boolean>,
  currentStatuses: Record<string, boolean | null>,
): ModuleStatusDiff {
  const changes: ModuleStatusChange[] = [];
  // Seed from the previous state so a module we could not read this round
  // keeps its last known-good value rather than being forgotten.
  const nextStatuses: Record<string, boolean> = { ...prevStatuses };

  for (const [moduleAddress, isEnabled] of Object.entries(currentStatuses)) {
    if (isEnabled === null) continue;

    const prevEnabled = prevStatuses[moduleAddress];
    nextStatuses[moduleAddress] = isEnabled;

    // A module seen for the first time is recorded but not announced.
    if (prevEnabled !== undefined && prevEnabled !== isEnabled) {
      changes.push({ moduleAddress, isEnabled });
    }
  }

  return { changes, nextStatuses };
}
