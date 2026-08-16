import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModuleManagement } from './ModuleManagement';
import type { ResolvedVaultModule } from '../hooks/useModuleInventory';

const mocks = vi.hoisted(() => ({ inventory: vi.fn() }));

vi.mock('../hooks/useModuleInventory', () => ({
  useModuleInventory: (...args: unknown[]) => mocks.inventory(...args),
}));

vi.mock('../services/MultisigService', () => ({
  multisigService: { getRecoveryConfig: vi.fn().mockResolvedValue(null) },
}));

vi.mock('./CopyButton', () => ({ CopyButton: () => null }));
vi.mock('./ExplorerLink', () => ({
  ExplorerLink: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('./SocialRecoveryConfiguration', () => ({ SocialRecoveryConfiguration: () => null }));
vi.mock('./SocialRecoveryManagement', () => ({ SocialRecoveryManagement: () => null }));
vi.mock('./transactionModals', () => ({
  DisableModuleModal: () => <div>disable modal</div>,
  EnableModuleModal: () => <div>enable modal</div>,
}));

const WALLET = '0x1111111111111111111111111111111111111111';
const MODULE = '0x2222222222222222222222222222222222222222';

function resolved(overrides: Partial<ResolvedVaultModule> = {}): ResolvedVaultModule {
  return {
    address: MODULE,
    isActive: true,
    authority: 'live',
    liveStatus: true,
    indexed: null,
    hasStatusMismatch: false,
    name: 'Unknown Module',
    description: 'Unrecognized vault module',
    kind: 'unknown',
    daoCandidate: null,
    dao: null,
    daoDisplay: null,
    daoVerification: null,
    ...overrides,
  };
}

function inventory(module: ResolvedVaultModule, liveReadAvailable = true) {
  return {
    modules: [module],
    activeModules: [module],
    historicalModules: [],
    historicalModuleCount: 0,
    historyTruncated: false,
    inventory: undefined,
    daoIndexer: undefined,
    isLoading: false,
    isRefreshing: false,
    liveReadAvailable,
    liveReadError: null,
    inventoryError: null,
    daoError: null,
    refetch: vi.fn(),
  };
}

function historicalIndexed(enabledAtBlock: number | null) {
  return {
    moduleAddress: MODULE,
    isActive: false,
    enabledAtBlock,
    enabledAtTx: enabledAtBlock === null ? null : `0x${'a'.repeat(64)}`,
    disabledAtBlock: 20,
    disabledAtTx: `0x${'b'.repeat(64)}`,
    lastEventBlock: 20,
    lastEventBlockHash: null,
    lastEventTx: `0x${'b'.repeat(64)}`,
    lastEventLogIndex: 1,
    executionCount: 0,
    successfulExecutionCount: 0,
    failedExecutionCount: 0,
    lastExecutionBlock: null,
    lastExecutionTx: null,
    lastExecutionLogIndex: null,
  };
}

function renderPanel(isOwner: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ModuleManagement walletAddress={WALLET} isOwner={isOwner} onUpdate={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('ModuleManagement authorization UX', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows active modules to viewers without exposing mutating controls', () => {
    mocks.inventory.mockReturnValue(inventory(resolved()));
    renderPanel(false);

    expect(screen.getByText('Unknown Module')).toBeInTheDocument();
    expect(screen.getByText('Active on-chain')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  });

  it('allows an owner to propose disabling an exact live module', () => {
    mocks.inventory.mockReturnValue(inventory(resolved()));
    renderPanel(true);

    expect(screen.getByRole('button', { name: 'Disable' })).toBeEnabled();
  });

  it('locks owner actions when only indexed status is available', () => {
    const module = resolved({ authority: 'indexed', liveStatus: null });
    mocks.inventory.mockReturnValue(inventory(module, false));
    renderPanel(true);

    expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled();
    expect(screen.getByText(/Live module verification is unavailable/)).toBeInTheDocument();
  });

  it('offers re-enable only when live state is disabled and enable provenance exists', () => {
    const module = resolved({
      isActive: false,
      liveStatus: false,
      indexed: historicalIndexed(10),
    });
    mocks.inventory.mockReturnValue({
      ...inventory(module),
      activeModules: [],
      historicalModules: [module],
      historicalModuleCount: 1,
    });
    renderPanel(true);

    fireEvent.click(screen.getByRole('button', { name: /Show module history/ }));
    expect(screen.getByRole('button', { name: 'Re-enable' })).toBeEnabled();
  });
});
