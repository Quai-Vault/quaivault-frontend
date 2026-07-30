import { Interface } from 'quais';
import type { ParamType } from 'quais';
import type { ContractAbi } from '../services/utils/ContractMetadataService';

export interface FunctionInputInfo {
  name: string;
  type: string;
  baseType: string;
  isArray: boolean;
  isTuple: boolean;
  components: ReadonlyArray<ParamType> | null;
  arrayChildren: ParamType | null;
}

export interface FunctionInfo {
  name: string;
  signature: string;
  selector: string;
  inputs: FunctionInputInfo[];
  stateMutability: string;
  payable: boolean;
  outputs: { name: string; type: string }[];
}

/**
 * The functions of an ABI a user could actually propose a transaction for.
 *
 * Only payable and nonpayable functions qualify. A `view` or `pure` function
 * changes nothing on chain, so offering it in the builder would invite a
 * proposal that costs the vault gas and does nothing — and it would still need
 * every owner's approval to get there.
 *
 * An ABI that cannot be parsed yields no functions rather than throwing: the
 * ABI is fetched from IPFS or an explorer, so being unusable is an expected
 * outcome, and the builder falls back to raw calldata.
 */
export function parseWriteFunctions(abi: ContractAbi): FunctionInfo[] {
  try {
    const iface = new Interface(abi);
    const writeFunctions: FunctionInfo[] = [];

    iface.forEachFunction((func) => {
      if (func.stateMutability !== 'payable' && func.stateMutability !== 'nonpayable') {
        return;
      }

      writeFunctions.push({
        name: func.name,
        signature: func.format('minimal'),
        selector: func.selector,
        inputs: func.inputs.map((p) => ({
          name: p.name,
          type: p.type,
          baseType: p.baseType,
          isArray: p.isArray(),
          isTuple: p.isTuple(),
          components: p.components,
          arrayChildren: p.arrayChildren,
        })),
        stateMutability: func.stateMutability,
        payable: func.payable,
        outputs: func.outputs.map((p) => ({ name: p.name, type: p.type })),
      });
    });

    return writeFunctions;
  } catch {
    return [];
  }
}
