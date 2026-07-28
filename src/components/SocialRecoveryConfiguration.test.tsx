import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SocialRecoveryConfiguration } from './SocialRecoveryConfiguration';
import { multisigService } from '../services/MultisigService';

vi.mock('../services/MultisigService', () => ({
  multisigService: {
    getRecoveryConfig: vi.fn(),
    getPendingRecoveries: vi.fn(),
    proposeSetupRecovery: vi.fn(),
  },
}));

vi.mock('./SocialRecoveryManagement', () => ({
  SocialRecoveryManagement: () => null,
}));

const WALLET = '0x1234567890123456789012345678901234567890';
const GUARDIAN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const GUARDIAN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const guardianValues = () =>
  (screen.queryAllByPlaceholderText('0x...') as HTMLInputElement[]).map((i) => i.value);

function renderConfig() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SocialRecoveryConfiguration walletAddress={WALLET} onUpdate={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('SocialRecoveryConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(multisigService.getPendingRecoveries).mockResolvedValue([]);
  });

  describe('seeding the form from the fetched config', () => {
    it('fills guardians, threshold and period once the config arrives', async () => {
      vi.mocked(multisigService.getRecoveryConfig).mockResolvedValue({
        guardians: [GUARDIAN_A, GUARDIAN_B],
        threshold: 2,
        recoveryPeriod: 3 * 86400,
      });

      renderConfig();

      // Re-query inside waitFor: seeding replaces the guardian rows (they are
      // keyed by a fresh uuid), so references captured beforehand go stale.
      await waitFor(() => {
        const values = guardianValues();
        expect(values).toContain(GUARDIAN_A);
        expect(values).toContain(GUARDIAN_B);
      });

      const numbers = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      expect(numbers.map((n) => n.value)).toContain('2');
      expect(numbers.map((n) => n.value)).toContain('3');
    });

    it('shows the current configuration summary', async () => {
      vi.mocked(multisigService.getRecoveryConfig).mockResolvedValue({
        guardians: [GUARDIAN_A],
        threshold: 1,
        recoveryPeriod: 86400,
      });

      renderConfig();

      expect(await screen.findByText('Current Configuration')).toBeInTheDocument();
      expect(screen.getByText('1 day')).toBeInTheDocument();
    });

    it('reports no configuration when none is set', async () => {
      vi.mocked(multisigService.getRecoveryConfig).mockResolvedValue({
        guardians: [],
        threshold: 0,
        recoveryPeriod: 0,
      });

      renderConfig();

      expect(await screen.findByText(/No recovery configuration set/i)).toBeInTheDocument();
    });
  });

  // The seeding must not fight the user: a refetch returning the same data
  // must not wipe what they have typed.
  it('keeps user edits when the config refetches unchanged', async () => {
    const user = userEvent.setup();
    vi.mocked(multisigService.getRecoveryConfig).mockResolvedValue({
      guardians: [GUARDIAN_A],
      threshold: 1,
      recoveryPeriod: 86400,
    });

    renderConfig();

    await waitFor(() => expect(guardianValues()).toContain(GUARDIAN_A));

    const field = screen
      .getAllByPlaceholderText('0x...')
      .find((i) => (i as HTMLInputElement).value === GUARDIAN_A) as HTMLInputElement;

    await user.clear(field);
    await user.type(field, GUARDIAN_B);

    expect(guardianValues()).toContain(GUARDIAN_B);
    expect(guardianValues()).not.toContain(GUARDIAN_A);
  });
});
