import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionBuilderService } from './TransactionBuilderService';

const { encodeFunctionData, parseQuai } = vi.hoisted(() => ({
  encodeFunctionData: vi.fn((name: string, args: unknown[]) => `encoded:${name}:${args.join(',')}`),
  // Mirrors quais closely enough to compare two parses against each other,
  // which is what the normalisation tests actually assert.
  parseQuai: vi.fn((value: string) => {
    if (!/^-?\d*\.?\d+$/.test(value)) throw new Error(`invalid decimal value: ${value}`);
    const [int, frac = ''] = value.split('.');
    return BigInt(int + frac.padEnd(18, '0').slice(0, 18));
  }),
}));

vi.mock('quais', () => ({
  parseQuai,
  Interface: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.encodeFunctionData = encodeFunctionData;
  }),
  formatQuai: (v: string | bigint) => String(v),
  formatUnits: (v: string | bigint) => String(v),
}));

describe('TransactionBuilderService', () => {
  let service: TransactionBuilderService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TransactionBuilderService();
  });

  describe('parseValue', () => {
    it('parses a plain decimal', () => {
      expect(service.parseValue('1.5')).toBe(service.parseValue('1.5'));
      expect(parseQuai).toHaveBeenCalledWith('1.5');
    });

    // Number inputs let a user type ".01"; quais wants a leading zero.
    it('accepts a leading decimal point', () => {
      expect(service.parseValue('.01')).toBe(service.parseValue('0.01'));
    });

    it('trims surrounding whitespace', () => {
      expect(service.parseValue('  2.5  ')).toBe(service.parseValue('2.5'));
    });

    it('normalises a whitespace-padded leading decimal', () => {
      expect(service.parseValue('  .75 ')).toBe(service.parseValue('0.75'));
    });

    it('wraps a parse failure in a clear message', () => {
      expect(() => service.parseValue('not-a-number')).toThrow(/Invalid value format/);
    });

    it('rejects an empty value', () => {
      expect(() => service.parseValue('')).toThrow(/Invalid value format/);
    });
  });

  describe('buildSetMinExecutionDelay', () => {
    it('encodes a delay in seconds', () => {
      service.buildSetMinExecutionDelay(3600);

      expect(encodeFunctionData).toHaveBeenCalledWith('setMinExecutionDelay', [3600]);
    });

    it('accepts zero, which clears the delay', () => {
      service.buildSetMinExecutionDelay(0);

      expect(encodeFunctionData).toHaveBeenCalledWith('setMinExecutionDelay', [0]);
    });

    it('accepts the largest uint32', () => {
      service.buildSetMinExecutionDelay(4294967295);

      expect(encodeFunctionData).toHaveBeenCalledWith('setMinExecutionDelay', [4294967295]);
    });

    // The contract field is uint32; encoding an out-of-range value would
    // either revert or silently wrap.
    it.each([
      ['above uint32', 4294967296],
      ['negative', -1],
      ['not a number', Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY],
    ])('rejects a %s delay', (_label, value) => {
      expect(() => service.buildSetMinExecutionDelay(value)).toThrow(/Invalid delay/);
      expect(encodeFunctionData).not.toHaveBeenCalled();
    });

    it('floors a fractional delay rather than encoding it', () => {
      service.buildSetMinExecutionDelay(90.7);

      expect(encodeFunctionData).toHaveBeenCalledWith('setMinExecutionDelay', [90]);
    });
  });

  describe('self-call builders', () => {
    const TX_HASH = '0x' + 'ab'.repeat(32);
    const TARGET = '0x1111111111111111111111111111111111111111';

    it('targets cancelByConsensus with the transaction hash', () => {
      service.buildCancelByConsensus(TX_HASH);

      expect(encodeFunctionData).toHaveBeenCalledWith('cancelByConsensus', [TX_HASH]);
    });

    it('targets addDelegatecallTarget', () => {
      service.buildAddDelegatecallTarget(TARGET);

      expect(encodeFunctionData).toHaveBeenCalledWith('addDelegatecallTarget', [TARGET]);
    });

    it('targets removeDelegatecallTarget', () => {
      service.buildRemoveDelegatecallTarget(TARGET);

      expect(encodeFunctionData).toHaveBeenCalledWith('removeDelegatecallTarget', [TARGET]);
    });

    // Sign and unsign are opposites; crossing them would attest to a message
    // the user meant to retract, or vice versa.
    it('targets signMessage', () => {
      service.buildSignMessage('0xbeef');

      expect(encodeFunctionData).toHaveBeenCalledWith('signMessage', ['0xbeef']);
    });

    it('targets unsignMessage', () => {
      service.buildUnsignMessage('0xbeef');

      expect(encodeFunctionData).toHaveBeenCalledWith('unsignMessage', ['0xbeef']);
    });

    it('returns the encoded calldata to the caller', () => {
      expect(service.buildSignMessage('0xbeef')).toBe('encoded:signMessage:0xbeef');
    });
  });
});
