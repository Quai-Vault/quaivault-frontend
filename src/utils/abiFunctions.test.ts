import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWriteFunctions } from './abiFunctions';
import type { ContractAbi } from '../services/utils/ContractMetadataService';

/**
 * A stand-in for quais' Interface. `forEachFunction` walks whatever fragments
 * the ABI declares, so a test can describe a contract by listing its functions
 * and their mutability.
 */
const { fragmentsFor, shouldThrow } = vi.hoisted(() => ({
  fragmentsFor: { current: [] as unknown[] },
  shouldThrow: { current: false },
}));

vi.mock('quais', () => ({
  Interface: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    if (shouldThrow.current) throw new Error('unparseable ABI');
    this.forEachFunction = (visit: (f: unknown) => void) => {
      fragmentsFor.current.forEach(visit);
    };
  }),
}));

function param(over: Record<string, unknown> = {}) {
  return {
    name: 'value',
    type: 'uint256',
    baseType: 'uint256',
    isArray: () => false,
    isTuple: () => false,
    components: null,
    arrayChildren: null,
    ...over,
  };
}

function fragment(name: string, stateMutability: string, over: Record<string, unknown> = {}) {
  return {
    name,
    stateMutability,
    payable: stateMutability === 'payable',
    selector: '0xa9059cbb',
    format: () => `${name}(uint256)`,
    inputs: [param()],
    outputs: [],
    ...over,
  };
}

const ABI = [] as ContractAbi;

describe('parseWriteFunctions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fragmentsFor.current = [];
    shouldThrow.current = false;
  });

  describe('which functions are offered', () => {
    it.each(['nonpayable', 'payable'])('includes a %s function', (mutability) => {
      fragmentsFor.current = [fragment('store', mutability)];

      expect(parseWriteFunctions(ABI).map((f) => f.name)).toEqual(['store']);
    });

    // A read-only call changes nothing on chain, so proposing one would cost
    // the vault gas and every owner's approval to achieve nothing.
    it.each(['view', 'pure'])('excludes a %s function', (mutability) => {
      fragmentsFor.current = [fragment('balanceOf', mutability)];

      expect(parseWriteFunctions(ABI)).toEqual([]);
    });

    it('keeps only the write functions from a mixed ABI', () => {
      fragmentsFor.current = [
        fragment('transfer', 'nonpayable'),
        fragment('balanceOf', 'view'),
        fragment('deposit', 'payable'),
        fragment('decimals', 'pure'),
      ];

      expect(parseWriteFunctions(ABI).map((f) => f.name)).toEqual(['transfer', 'deposit']);
    });

    it('reports none for an ABI with no functions', () => {
      expect(parseWriteFunctions(ABI)).toEqual([]);
    });
  });

  describe('what each function carries', () => {
    it('records the signature and selector the builder shows', () => {
      fragmentsFor.current = [fragment('store', 'nonpayable')];

      const [fn] = parseWriteFunctions(ABI);

      expect(fn.signature).toBe('store(uint256)');
      expect(fn.selector).toBe('0xa9059cbb');
    });

    it('marks a payable function so the form can offer a value field', () => {
      fragmentsFor.current = [fragment('deposit', 'payable')];

      const [fn] = parseWriteFunctions(ABI);

      expect(fn.payable).toBe(true);
      expect(fn.stateMutability).toBe('payable');
    });

    it('does not mark a nonpayable function as payable', () => {
      fragmentsFor.current = [fragment('store', 'nonpayable')];

      expect(parseWriteFunctions(ABI)[0].payable).toBe(false);
    });

    it('describes each input so the form can render a field per argument', () => {
      fragmentsFor.current = [
        fragment('transfer', 'nonpayable', {
          inputs: [
            param({ name: 'to', type: 'address', baseType: 'address' }),
            param({ name: 'amount', type: 'uint256' }),
          ],
        }),
      ];

      const [fn] = parseWriteFunctions(ABI);

      expect(fn.inputs.map((i) => i.name)).toEqual(['to', 'amount']);
      expect(fn.inputs[0].baseType).toBe('address');
    });

    // Arrays and tuples need different inputs from a plain value, so the flags
    // have to survive the mapping.
    it('carries the array and tuple flags through', () => {
      fragmentsFor.current = [
        fragment('batch', 'nonpayable', {
          inputs: [
            param({ name: 'ids', type: 'uint256[]', isArray: () => true, arrayChildren: param() }),
            param({ name: 'config', type: 'tuple', isTuple: () => true, components: [param()] }),
          ],
        }),
      ];

      const [fn] = parseWriteFunctions(ABI);

      expect(fn.inputs[0].isArray).toBe(true);
      expect(fn.inputs[0].arrayChildren).not.toBeNull();
      expect(fn.inputs[1].isTuple).toBe(true);
      expect(fn.inputs[1].components).toHaveLength(1);
    });

    it('handles a function with no arguments', () => {
      fragmentsFor.current = [fragment('poke', 'nonpayable', { inputs: [] })];

      expect(parseWriteFunctions(ABI)[0].inputs).toEqual([]);
    });

    it('records the outputs', () => {
      fragmentsFor.current = [
        fragment('mint', 'nonpayable', { outputs: [param({ name: 'tokenId' })] }),
      ];

      expect(parseWriteFunctions(ABI)[0].outputs).toEqual([
        { name: 'tokenId', type: 'uint256' },
      ]);
    });
  });

  // ABIs come from IPFS or an explorer, so an unusable one is expected rather
  // than exceptional — the builder falls back to raw calldata.
  it('yields no functions for an ABI that cannot be parsed', () => {
    shouldThrow.current = true;

    expect(parseWriteFunctions(ABI)).toEqual([]);
  });
});
