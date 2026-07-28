import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddOwnerModal } from './AddOwnerModal';
import { ChangeThresholdModal } from './ChangeThresholdModal';
import { DisableModuleModal } from './DisableModuleModal';
import { RemoveOwnerModal } from './RemoveOwnerModal';

/**
 * These five modals used to reimplement useTransactionModalFlow inline, with
 * their form-reset work in an effect. Migrating moved that into the hook's
 * onBeforeClose, which fires on an open-to-closed transition rather than on
 * mount. These cover the contract that change has to preserve: the confirm
 * step leads to the flow, and reopening starts from a clean form.
 */

// The flow itself runs the transaction on mount; stub it to a marker so these
// tests are about the modal's own state machine.
vi.mock('../TransactionFlow', () => ({
  TransactionFlow: ({ title }: { title?: string }) => (
    <div data-testid="flow">{title ?? 'flow'}</div>
  ),
}));

const mutations = {
  addOwnerAsync: vi.fn().mockResolvedValue('0xtx'),
  changeThresholdAsync: vi.fn().mockResolvedValue('0xtx'),
  disableModuleAsync: vi.fn().mockResolvedValue('0xtx'),
  removeOwnerAsync: vi.fn().mockResolvedValue('0xtx'),
};

vi.mock('../../hooks/useMultisig', () => ({
  useMultisig: () => mutations,
}));

const WALLET = '0x1234567890123456789012345678901234567890';
const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MODULE = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const flowShown = () => screen.queryByTestId('flow') !== null;

describe('migrated transaction modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RemoveOwnerModal', () => {
    const renderIt = (isOpen: boolean) =>
      render(
        <RemoveOwnerModal
          isOpen={isOpen}
          onClose={vi.fn()}
          walletAddress={WALLET}
          ownerToRemove={OWNER}
          threshold={2}
        />
      );

    it('starts on the confirmation step', () => {
      renderIt(true);

      expect(flowShown()).toBe(false);
      expect(screen.getByRole('button', { name: /Remove Owner/i })).toBeInTheDocument();
    });

    it('shows the flow once confirmed', async () => {
      const user = userEvent.setup();
      renderIt(true);

      await user.click(screen.getByRole('button', { name: /Remove Owner/i }));

      expect(flowShown()).toBe(true);
    });

    it('returns to the confirmation step when reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = renderIt(true);

      await user.click(screen.getByRole('button', { name: /Remove Owner/i }));
      expect(flowShown()).toBe(true);

      rerender(
        <RemoveOwnerModal
          isOpen={false}
          onClose={vi.fn()}
          walletAddress={WALLET}
          ownerToRemove={OWNER}
          threshold={2}
        />
      );
      rerender(
        <RemoveOwnerModal
          isOpen
          onClose={vi.fn()}
          walletAddress={WALLET}
          ownerToRemove={OWNER}
          threshold={2}
        />
      );

      expect(flowShown()).toBe(false);
    });
  });

  describe('AddOwnerModal', () => {
    const props = (isOpen: boolean) => ({
      isOpen,
      onClose: vi.fn(),
      walletAddress: WALLET,
      threshold: 1,
      existingOwners: [OWNER],
    });

    it('clears the typed address when reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<AddOwnerModal {...props(true)} />);

      const field = screen.getByRole('textbox');
      await user.type(field, '0xcccccccccccccccccccccccccccccccccccccccc');
      expect(field).toHaveValue('0xcccccccccccccccccccccccccccccccccccccccc');

      rerender(<AddOwnerModal {...props(false)} />);
      rerender(<AddOwnerModal {...props(true)} />);

      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  describe('ChangeThresholdModal', () => {
    const props = (isOpen: boolean) => ({
      isOpen,
      onClose: vi.fn(),
      walletAddress: WALLET,
      currentThreshold: 2,
      ownerCount: 3,
    });

    it('seeds the input from the current threshold', () => {
      render(<ChangeThresholdModal {...props(true)} />);

      expect(screen.getByRole('spinbutton')).toHaveValue(2);
    });

    it('restores the current threshold when reopened after an edit', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ChangeThresholdModal {...props(true)} />);

      const field = screen.getByRole('spinbutton');
      // Clearing lands on 1 (the input's own `|| 1` fallback) and typing
      // appends, so assert only that the value moved off the seeded one.
      await user.clear(field);
      await user.type(field, '3');
      expect(field).not.toHaveValue(2);

      rerender(<ChangeThresholdModal {...props(false)} />);
      rerender(<ChangeThresholdModal {...props(true)} />);

      expect(screen.getByRole('spinbutton')).toHaveValue(2);
    });
  });

  describe('DisableModuleModal', () => {
    const props = (isOpen: boolean) => ({
      isOpen,
      onClose: vi.fn(),
      walletAddress: WALLET,
      moduleAddress: MODULE,
      moduleName: 'Social Recovery',
    });

    it('starts on the confirmation step', () => {
      render(<DisableModuleModal {...props(true)} />);

      expect(flowShown()).toBe(false);
    });

    it('returns to the confirmation step when reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<DisableModuleModal {...props(true)} />);

      await user.click(screen.getByRole('button', { name: /Disable/i }));
      expect(flowShown()).toBe(true);

      rerender(<DisableModuleModal {...props(false)} />);
      rerender(<DisableModuleModal {...props(true)} />);

      expect(flowShown()).toBe(false);
    });
  });
});
