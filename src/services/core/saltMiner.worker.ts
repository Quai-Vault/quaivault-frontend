import { keccak256, solidityPacked, getCreate2Address, isQuaiAddress, randomBytes, hexlify } from 'quais';

interface MineRequest {
  factoryAddress: string;
  bytecodeHash: string;
  senderAddress: string;
  targetPrefix: string;
  maxAttempts: number;
}

interface MineProgress {
  type: 'progress';
  attempts: number;
}

interface MineResult {
  type: 'result';
  salt: string;
  expectedAddress: string;
}

interface MineError {
  type: 'error';
  message: string;
}

const PROGRESS_INTERVAL = 1000;

self.onmessage = (e: MessageEvent<MineRequest>) => {
  try {
    const { factoryAddress, bytecodeHash, senderAddress, targetPrefix, maxAttempts } = e.data;

    for (let i = 0; i < maxAttempts; i++) {
      const userSalt = hexlify(randomBytes(32));

      const fullSalt = keccak256(
        solidityPacked(['address', 'bytes32'], [senderAddress, userSalt])
      );

      const create2Address = getCreate2Address(factoryAddress, fullSalt, bytecodeHash);

      if (
        create2Address.toLowerCase().startsWith(targetPrefix) &&
        isQuaiAddress(create2Address)
      ) {
        self.postMessage({ type: 'result', salt: userSalt, expectedAddress: create2Address } satisfies MineResult);
        return;
      }

      if ((i + 1) % PROGRESS_INTERVAL === 0) {
        self.postMessage({ type: 'progress', attempts: i + 1 } satisfies MineProgress);
      }
    }

    self.postMessage({ type: 'error', message: `Could not mine a valid address after ${maxAttempts} attempts` } satisfies MineError);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unknown mining error' } satisfies MineError);
  }
};
