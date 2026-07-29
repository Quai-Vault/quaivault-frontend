import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContractInteractionBuilder } from './ContractInteractionBuilder';
import type { FunctionInfo } from '../hooks/useContractInteraction';
import type { ContractAbi } from '../services/utils/ContractMetadataService';

const { encodeFunctionData } = vi.hoisted(() => ({
  encodeFunctionData: vi.fn((name: string, values: unknown[]) => `0xENC_${name}_${values.join('|')}`),
}));

vi.mock('quais', () => ({
  Interface: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.encodeFunctionData = encodeFunctionData;
  }),
  isQuaiAddress: (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a),
  parseUnits: (v: string, d: number) => BigInt(v.replace('.', '').padEnd(d + 1, '0')),
}));

// Balance/ownership checks are covered by their own tests.
vi.mock('../hooks/useAssetValidation', () => ({
  useAssetValidation: () => ({
    erc20BalanceFormatted: null,
    isLoadingBalance: false,
    insufficientBalance: false,
    nftOwner: null,
    isLoadingNftOwner: false,
    vaultOwnsNft: null,
    validationWarning: null,
  }),
}));

const ABI = [{ type: 'function', name: 'store' }] as ContractAbi;

function fn(name: string, inputs: { name: string; type: string }[]): FunctionInfo {
  return {
    name,
    signature: `${name}(...)`,
    selector: '0x00000000',
    inputs: inputs.map((i) => ({
      name: i.name,
      type: i.type,
      baseType: i.type,
      isArray: false,
      isTuple: false,
      components: null,
      arrayChildren: null,
    })),
    stateMutability: 'nonpayable',
    payable: false,
    outputs: [],
  };
}

const FUNCTIONS = [fn('store', [{ name: 'value', type: 'uint256' }])];

function setup(overrides: Partial<Parameters<typeof ContractInteractionBuilder>[0]> = {}) {
  const onDataChange = vi.fn();
  const onValueChange = vi.fn();
  render(
    <ContractInteractionBuilder
      abi={ABI}
      abiSource="known"
      isFetchingAbi={false}
      abiFetchError={null}
      functions={FUNCTIONS}
      contractType="generic"
      tokenMetadata={null}
      onDataChange={onDataChange}
      onValueChange={onValueChange}
      currentValue="0"
      setManualAbi={vi.fn()}
      {...overrides}
    />
  );
  return { onDataChange, onValueChange };
}

const selectFunction = (index: number) =>
  fireEvent.change(screen.getByRole('combobox'), { target: { value: String(index) } });

const argInput = () => screen.getAllByRole('textbox')[0];
const rawDataBox = () => screen.getByLabelText('Raw calldata');

describe('ContractInteractionBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks resets calls but not implementations, so the throwing
    // encoder from the failure test would leak into every test after it.
    encodeFunctionData.mockImplementation(
      (name: string, values: unknown[]) => `0xENC_${name}_${values.join('|')}`
    );
  });

  describe('encoding from the form', () => {
    it('does not encode until every argument has a value', () => {
      setup();
      selectFunction(0);

      expect(encodeFunctionData).not.toHaveBeenCalled();
    });

    it('encodes once the arguments are filled', () => {
      const { onDataChange } = setup();
      selectFunction(0);

      fireEvent.change(argInput(), { target: { value: '42' } });

      expect(encodeFunctionData).toHaveBeenCalledWith('store', ['42']);
      expect(onDataChange).toHaveBeenLastCalledWith('0xENC_store_42');
    });

    it('re-encodes when an argument changes', () => {
      const { onDataChange } = setup();
      selectFunction(0);

      fireEvent.change(argInput(), { target: { value: '1' } });
      fireEvent.change(argInput(), { target: { value: '2' } });

      expect(onDataChange).toHaveBeenLastCalledWith('0xENC_store_2');
    });

    it('surfaces an encoding failure instead of sending bad calldata', () => {
      encodeFunctionData.mockImplementation(() => {
        throw new Error('value out of range');
      });
      setup();
      selectFunction(0);

      fireEvent.change(argInput(), { target: { value: 'nonsense' } });

      expect(screen.getByText(/value out of range/i)).toBeInTheDocument();
    });

    it('clears the calldata when the function is deselected', () => {
      const { onDataChange } = setup();
      selectFunction(0);
      fireEvent.change(argInput(), { target: { value: '42' } });

      selectFunction(-1);

      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });

    it('forces the value to zero for a nonpayable function', () => {
      const { onValueChange } = setup({ currentValue: '5' });

      selectFunction(0);

      expect(onValueChange).toHaveBeenCalledWith('0');
    });
  });

  describe('raw calldata mode', () => {
    const openRawData = () => fireEvent.click(screen.getByText(/Show Raw Data/i));

    it('sends exactly what the user typed', () => {
      const { onDataChange } = setup();
      openRawData();

      fireEvent.change(rawDataBox(), { target: { value: '0xdeadbeef' } });

      expect(onDataChange).toHaveBeenLastCalledWith('0xdeadbeef');
    });

    // The two directions are mutually exclusive: editing raw calldata drops the
    // form selection, so the encoder cannot overwrite what was typed.
    it('deselects the function so the encoder stops driving the value', () => {
      setup();
      selectFunction(0);
      openRawData();

      fireEvent.change(rawDataBox(), { target: { value: '0xdeadbeef' } });

      expect(screen.getByRole('combobox')).toHaveValue('-1');
    });

    it('keeps the typed calldata rather than re-encoding over it', () => {
      const { onDataChange } = setup();
      selectFunction(0);
      fireEvent.change(argInput(), { target: { value: '42' } });
      openRawData();

      fireEvent.change(rawDataBox(), { target: { value: '0xdeadbeef' } });

      expect(onDataChange).toHaveBeenLastCalledWith('0xdeadbeef');
      expect(rawDataBox()).toHaveValue('0xdeadbeef');
    });

    it('mirrors the encoded calldata while the form is driving', () => {
      setup();
      selectFunction(0);
      fireEvent.change(argInput(), { target: { value: '42' } });
      openRawData();

      expect(rawDataBox()).toHaveValue('0xENC_store_42');
    });
  });
});
