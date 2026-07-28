import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeTransaction, getModuleName } from './transactionDecoder';

/**
 * The decoder builds one Interface per ABI it knows about, all at module scope.
 * Route parsing by which ABI an instance was constructed with, so a test can
 * say "this calldata decodes as an ERC-20 transfer" without touching the rest.
 */
const { parse, abiKind, SOCIAL_RECOVERY } = vi.hoisted(() => {
  const SOCIAL_RECOVERY = '0x9999999999999999999999999999999999999999';
  const abiKind = (abi: unknown): string => {
    const serialised = JSON.stringify(abi) ?? '';
    if (serialised.includes('setupRecovery')) return 'module';
    if (serialised.includes('safeBatchTransferFrom')) return 'erc1155';
    if (serialised.includes('uint256 tokenId')) return 'erc721';
    if (serialised.includes('function transfer(address to, uint256 amount)')) return 'erc20';
    return 'quaiVault';
  };
  return { parse: vi.fn(), abiKind, SOCIAL_RECOVERY };
});

vi.mock('quais', () => ({
  Interface: vi.fn().mockImplementation(function (this: Record<string, unknown>, abi: unknown) {
    const kind = abiKind(abi);
    this.parseTransaction = (arg: { data: string }) => parse(kind, arg);
  }),
  formatQuai: (value: string | bigint) => {
    const str = String(value).padStart(19, '0');
    const int = str.slice(0, str.length - 18) || '0';
    const frac = str.slice(str.length - 18).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  },
  formatUnits: (value: string | bigint, decimals = 18) => {
    const str = String(value).padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals) || '0';
    const frac = str.slice(str.length - decimals).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  },
}));

vi.mock('../config/contracts', () => ({
  CONTRACT_ADDRESSES: { SOCIAL_RECOVERY_MODULE: SOCIAL_RECOVERY },
}));

const VAULT = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';

/** Make one ABI's parse succeed and every other fail, as quais would. */
function decodesAs(kind: string, name: string, args: unknown[] = []) {
  parse.mockImplementation((which: string) => {
    if (which !== kind) throw new Error('no matching function');
    return { name, args };
  });
}

// Long enough to clear the decoder's `data.length > 10` guard, as real
// selector-plus-arguments calldata always is.
const CALLDATA = '0xa9059cbb' + '0'.repeat(128);

const tx = (over: Partial<Parameters<typeof decodeTransaction>[0]> = {}) => ({
  to: RECIPIENT,
  value: '0',
  data: CALLDATA,
  ...over,
});

describe('decodeTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parse.mockImplementation(() => {
      throw new Error('no matching function');
    });
  });

  describe('plain value transfer', () => {
    it('describes an empty-calldata transfer', () => {
      const result = decodeTransaction(
        tx({ data: '0x', value: '1500000000000000000' }),
        VAULT
      );

      expect(result.type).toBe('transfer');
      expect(result.description).toBe('Transfer QUAI');
      expect(result.details).toContain('1.5');
    });

    it('treats an empty string as empty calldata too', () => {
      expect(decodeTransaction(tx({ data: '' }), VAULT).type).toBe('transfer');
    });
  });

  describe('indexer-supplied parameters', () => {
    it('describes an ERC-20 transfer', () => {
      const result = decodeTransaction(
        tx({
          transactionType: 'erc20_transfer',
          decodedParams: { to: RECIPIENT, amount: '5' },
        }),
        VAULT
      );

      expect(result.type).toBe('erc20_transfer');
      expect(result.description).toBe('Token Transfer');
      expect(result.details).toContain('Send');
    });

    // Indexers name the same fields differently; a missed alias silently
    // degrades the description a user reads before signing.
    it.each([
      ['value/recipient', { recipient: RECIPIENT, value: '5' }],
      ['_value/_to', { _to: RECIPIENT, _value: '5' }],
      ['_amount/dst', { dst: RECIPIENT, _amount: '5' }],
    ])('accepts the %s spelling', (_label, params) => {
      const result = decodeTransaction(
        tx({ transactionType: 'erc20_transfer', decodedParams: params }),
        VAULT
      );

      expect(result.type).toBe('erc20_transfer');
      expect(result.details).not.toContain('? tokens to ?');
    });

    it('calls out an approval rather than a transfer', () => {
      const result = decodeTransaction(
        tx({
          transactionType: 'erc20_transfer',
          decodedParams: { spender: RECIPIENT, amount: '5' },
        }),
        VAULT
      );

      expect(result.description).toBe('Token Approval');
      expect(result.details).toContain('Approve');
    });

    it('names the source on a transferFrom', () => {
      const result = decodeTransaction(
        tx({
          transactionType: 'erc20_transfer',
          decodedParams: { from: TOKEN, to: RECIPIENT, amount: '5' },
        }),
        VAULT
      );

      expect(result.details).toContain('from');
    });

    it('formats the amount with token decimals when known', () => {
      const result = decodeTransaction(
        tx({
          transactionType: 'erc20_transfer',
          decodedParams: { to: RECIPIENT, amount: '2500000' },
        }),
        VAULT,
        { decimals: 6, symbol: 'USDC', name: 'USD Coin' }
      );

      expect(result.details).toContain('2.5');
      expect(result.details).toContain('USDC');
    });

    // Zero-decimal tokens exist, and their raw value is already the display
    // amount — but the symbol still has to survive, or the signer cannot tell
    // which token is moving.
    it('keeps the symbol for a zero-decimal token', () => {
      const result = decodeTransaction(
        tx({
          transactionType: 'erc20_transfer',
          decodedParams: { to: RECIPIENT, amount: '5' },
        }),
        VAULT,
        { decimals: 0, symbol: 'GLD', name: 'Gold' }
      );

      expect(result.details).toContain('5');
      expect(result.details).toContain('GLD');
    });

    it('describes an NFT transfer', () => {
      const result = decodeTransaction(
        tx({
          transactionType: 'erc721_transfer',
          decodedParams: { from: VAULT, to: RECIPIENT, tokenId: '42' },
        }),
        VAULT
      );

      expect(result.type).toBe('erc721_transfer');
      expect(result.details).toContain('#42');
    });

    it('accepts the snake_case token id an indexer may send', () => {
      const result = decodeTransaction(
        tx({
          transactionType: 'erc721_transfer',
          decodedParams: { to: RECIPIENT, token_id: '42' },
        }),
        VAULT
      );

      expect(result.details).toContain('#42');
    });

    // Params that carry nothing usable must not produce "send ? to ?" — the
    // calldata is still there to decode.
    it('falls through to calldata when the params are useless', () => {
      decodesAs('erc20', 'transfer', [RECIPIENT, 5n]);

      const result = decodeTransaction(
        tx({ transactionType: 'erc20_transfer', decodedParams: { unrelated: 'x' } }),
        VAULT
      );

      // The calldata decode wins, so the description names a real recipient.
      expect(result.type).toBe('erc20_transfer');
      expect(result.details).toContain('Send');
    });
  });

  describe('self-calls to the vault', () => {
    const selfCall = (name: string, args: unknown[] = []) => {
      decodesAs('quaiVault', name, args);
      return decodeTransaction(tx({ to: VAULT }), VAULT);
    };

    it('describes adding an owner', () => {
      expect(selfCall('addOwner', [RECIPIENT]).type).toBe('addOwner');
    });

    it('describes removing an owner', () => {
      expect(selfCall('removeOwner', [RECIPIENT]).type).toBe('removeOwner');
    });

    it('describes a threshold change', () => {
      const result = selfCall('changeThreshold', [3]);

      expect(result.type).toBe('changeThreshold');
      expect(result.details).toContain('3');
    });

    it('describes a cancel-by-consensus and names the target', () => {
      const target = '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const result = selfCall('cancelByConsensus', [target]);

      expect(result.description).toBe('Cancel by Consensus');
      expect(result.details).toContain(target.slice(0, 10));
    });

    it('describes setting a timelock', () => {
      const result = selfCall('setMinExecutionDelay', [3600]);

      expect(result.description).toBe('Set Timelock');
      expect(result.details).toContain('Set minimum execution delay');
    });

    it('calls out removing the timelock when the delay is zero', () => {
      expect(selfCall('setMinExecutionDelay', [0]).details).toBe(
        'Remove minimum execution delay'
      );
    });

    it('describes enabling a module', () => {
      expect(selfCall('enableModule', [SOCIAL_RECOVERY]).type).toBe('enableModule');
    });

    // disableModule takes (prevModule, module) — naming the first argument
    // would report the wrong module as being turned off.
    it('names the second argument as the module being disabled', () => {
      const result = selfCall('disableModule', [RECIPIENT, SOCIAL_RECOVERY]);

      expect(result.type).toBe('disableModule');
      expect(result.details).toContain('Social Recovery');
    });

    it('falls back for an unrecognised self-call', () => {
      const result = decodeTransaction(tx({ to: VAULT }), VAULT);

      expect(result.type).toBe('contractCall');
    });

    it('matches the vault address case-insensitively', () => {
      decodesAs('quaiVault', 'addOwner', [RECIPIENT]);

      const result = decodeTransaction(
        tx({ to: VAULT.toUpperCase().replace('0X', '0x') }),
        VAULT
      );

      expect(result.type).toBe('addOwner');
    });
  });

  describe('calls to a known module', () => {
    it('describes a recovery configuration', () => {
      decodesAs('module', 'setupRecovery', [VAULT, [RECIPIENT, TOKEN], 2, 86400]);

      const result = decodeTransaction(tx({ to: SOCIAL_RECOVERY }), VAULT);

      expect(result.type).toBe('moduleConfig');
      expect(result.details).toContain('2 guardians');
    });

    it('still identifies the module when the function is unknown', () => {
      const result = decodeTransaction(tx({ to: SOCIAL_RECOVERY }), VAULT);

      expect(result.type).toBe('moduleConfig');
      expect(result.description).toContain('Social Recovery');
    });
  });

  describe('token calls decoded from calldata', () => {
    it('describes an ERC-20 transfer', () => {
      decodesAs('erc20', 'transfer', [RECIPIENT, 5n]);

      expect(decodeTransaction(tx({ to: TOKEN }), VAULT).type).toBe('erc20_transfer');
    });

    it('describes an ERC-20 approval', () => {
      decodesAs('erc20', 'approve', [RECIPIENT, 5n]);

      const result = decodeTransaction(tx({ to: TOKEN }), VAULT);

      expect(result.type).toBe('erc20_transfer');
      expect(result.description).toContain('Approval');
    });

    it('describes an ERC-721 transfer', () => {
      decodesAs('erc721', 'transferFrom', [VAULT, RECIPIENT, 7n]);

      const result = decodeTransaction(tx({ to: TOKEN }), VAULT);

      expect(result.type).toBe('erc721_transfer');
      expect(result.details).toContain('7');
    });

    it('describes an ERC-1155 batch transfer', () => {
      decodesAs('erc1155', 'safeBatchTransferFrom', [VAULT, RECIPIENT, [1n, 2n], [3n, 4n], '0x']);

      expect(decodeTransaction(tx({ to: TOKEN }), VAULT).type).toBe(
        'erc1155_batch_transfer'
      );
    });
  });

  it('falls back to a generic contract call when nothing decodes', () => {
    const result = decodeTransaction(tx({ to: TOKEN }), VAULT);

    expect(result.type).toBe('contractCall');
    expect(result.icon).toBeTruthy();
  });
});

describe('getModuleName', () => {
  it('names a known module', () => {
    expect(getModuleName(SOCIAL_RECOVERY)).toBe('Social Recovery');
  });

  it('matches regardless of casing', () => {
    expect(getModuleName(SOCIAL_RECOVERY.toUpperCase().replace('0X', '0x'))).toBe(
      'Social Recovery'
    );
  });

  it('returns null for an unknown address', () => {
    expect(getModuleName(RECIPIENT)).toBeNull();
  });
});
