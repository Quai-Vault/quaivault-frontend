import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncStatusBadge } from './SyncStatusBadge';
import { useIndexerConnection } from '../hooks/useIndexerConnection';

vi.mock('../hooks/useIndexerConnection', () => ({
  useIndexerConnection: vi.fn(),
}));

type Connection = ReturnType<typeof useIndexerConnection>;

function setConnection(over: Partial<Connection>) {
  vi.mocked(useIndexerConnection).mockReturnValue({
    isEnabled: true,
    isLoading: false,
    isConnected: true,
    isSynced: true,
    blocksBehind: null,
    ...over,
  } as Connection);
}

/** The badge's meaning lives in its title, so assert on that. */
const badgeTitle = () => document.querySelector('[title]')?.getAttribute('title') ?? null;

describe('SyncStatusBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the indexer is not configured', () => {
    setConnection({ isEnabled: false });

    const { container } = render(<SyncStatusBadge />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a connecting state while the check is in flight', () => {
    setConnection({ isLoading: true });

    render(<SyncStatusBadge />);

    expect(screen.getByText(/Connecting/i)).toBeInTheDocument();
  });

  it('warns that updates are slower when not connected', () => {
    setConnection({ isConnected: false });

    render(<SyncStatusBadge />);

    expect(screen.getByText(/Direct Mode/i)).toBeInTheDocument();
  });

  it('reports live updates when connected and synced', () => {
    setConnection({ isConnected: true, isSynced: true });

    render(<SyncStatusBadge />);

    expect(screen.getByText(/Live/i)).toBeInTheDocument();
    expect(badgeTitle()).toMatch(/Real-time updates enabled/i);
  });

  describe('when the indexer is behind', () => {
    it('shows how far behind it is when that is known', () => {
      setConnection({ isConnected: true, isSynced: false, blocksBehind: 42 });

      render(<SyncStatusBadge />);

      expect(screen.getByText(/Syncing/i)).toBeInTheDocument();
      expect(screen.getByText(/42 behind/)).toBeInTheDocument();
    });

    // The health endpoint reports isSyncing separately from blocksBehind, and
    // may say it is syncing without saying how far. Claiming "Live" there tells
    // the user real-time updates are enabled while the indexer is still
    // catching up — the opposite of what it knows.
    it('still says it is syncing when the block count is unknown', () => {
      setConnection({ isConnected: true, isSynced: false, blocksBehind: null });

      render(<SyncStatusBadge />);

      expect(screen.getByText(/Syncing/i)).toBeInTheDocument();
      expect(screen.queryByText(/^Live$/)).not.toBeInTheDocument();
    });

    it('omits the count rather than printing a placeholder', () => {
      setConnection({ isConnected: true, isSynced: false, blocksBehind: null });

      render(<SyncStatusBadge />);

      expect(screen.queryByText(/behind/)).not.toBeInTheDocument();
      expect(badgeTitle()).not.toMatch(/null/);
    });
  });
});
