import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { WalletCreationFlow } from '../components/WalletCreationFlow';
import { multisigService } from '../services/MultisigService';
import { isQuaiAddress } from 'quais';

export function CreateWallet() {
  const navigate = useNavigate();
  const { connected } = useWallet();

  const [ownerInputs, setOwnerInputs] = useState<{ id: string; value: string }[]>([
    { id: crypto.randomUUID(), value: '' },
  ]);
  const [threshold, setThreshold] = useState(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [showFlow, setShowFlow] = useState(false);

  // Derive plain string array for validation and deployment
  const owners = ownerInputs.map(o => o.value);
  const validOwnerCount = useMemo(() => owners.filter(o => o.trim() !== '').length, [owners]);

  const addOwner = () => {
    setOwnerInputs([...ownerInputs, { id: crypto.randomUUID(), value: '' }]);
  };

  const removeOwner = (index: number) => {
    const newInputs = ownerInputs.filter((_, i) => i !== index);
    setOwnerInputs(newInputs);

    // Adjust threshold if needed
    if (threshold > newInputs.length) {
      setThreshold(newInputs.length);
    }
  };

  const updateOwner = (index: number, value: string) => {
    const newInputs = [...ownerInputs];
    newInputs[index] = { ...newInputs[index], value };
    setOwnerInputs(newInputs);
  };

  const validateForm = (): boolean => {
    const newErrors: string[] = [];

    // Filter out empty addresses
    const validOwners = owners.filter(o => o.trim() !== '');

    if (validOwners.length === 0) {
      newErrors.push('At least one owner is required');
    }

    // Validate addresses
    for (const owner of validOwners) {
      if (!isQuaiAddress(owner)) {
        const ownerStr = String(owner);
        newErrors.push(`Invalid address: ${ownerStr.substring(0, 10)}...`);
      }
    }

    // Check for duplicates
    const uniqueOwners = new Set(validOwners.map(o => o.toLowerCase()));
    if (uniqueOwners.size !== validOwners.length) {
      newErrors.push('Duplicate owner addresses found');
    }

    // Validate threshold
    if (threshold < 1) {
      newErrors.push('Threshold must be at least 1');
    }

    if (threshold > validOwners.length) {
      newErrors.push('Threshold cannot exceed number of owners');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleStartFlow = () => {
    if (!validateForm()) {
      return;
    }
    setShowFlow(true);
  };

  const handleDeploy = async (
    onProgress: (progress: {
      step: 'mining' | 'deploying' | 'deploying_waiting' | 'success';
      txHash?: string;
      walletAddress?: string;
      expectedAddress?: string;
      miningAttempts?: number;
      message?: string;
    }) => void
  ): Promise<string> => {
    const validOwners = owners.filter(o => o.trim() !== '');
    
    return await multisigService.deployWallet(
      {
        owners: validOwners,
        threshold,
      },
      onProgress
    );
  };

  const handleComplete = (walletAddress: string) => {
    // Navigate directly to the new wallet
    navigate(`/wallet/${walletAddress}`);
  };

  const handleCancel = () => {
    setShowFlow(false);
  };

  if (!connected) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-primary-600/30 mb-6">
          <svg
            className="mx-auto h-10 w-10 text-primary-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-gradient-red vault-text-glow mb-3">
          Connect Your Wallet
        </h2>
        <p className="text-dark-500 dark:text-dark-400 font-medium mb-2">
          Please connect your wallet to create a QuaiVault
        </p>
        <p className="text-base font-mono text-dark-600 uppercase tracking-wider">
          Secure wallet connection required
        </p>
      </div>
    );
  }

  // Show deployment flow if started
  if (showFlow) {
    const validOwners = owners.filter(o => o.trim() !== '');
    return (
      <WalletCreationFlow
        owners={validOwners}
        threshold={threshold}
        onDeploy={handleDeploy}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-display font-bold text-gradient-red vault-text-glow mb-2">Create QuaiVault</h1>
        <p className="text-lg font-mono text-dark-500 uppercase tracking-wider">Configure your secure multisig wallet</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleStartFlow(); }} className="vault-panel p-8">
        {/* Owners Section */}
        <div className="mb-8">
          <div className="mb-4">
            <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-2">
              Owners
            </label>
            <p className="text-lg text-dark-500 dark:text-dark-400">
              Add the addresses that will be able to approve and execute transactions
            </p>
          </div>

          <div className="space-y-3">
            {ownerInputs.map((owner, index) => (
              <div key={owner.id} className="flex gap-4">
                <div className="flex-1 relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-dark-100 dark:bg-vault-dark-4 border border-dark-300 dark:border-dark-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-base font-bold text-primary-600 dark:text-primary-400">{index + 1}</span>
                  </div>
                  <input
                    type="text"
                    value={owner.value}
                    onChange={(e) => updateOwner(index, e.target.value)}
                    placeholder="0x..."
                    className="input-field w-full pl-12"
                  />
                </div>
                {ownerInputs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOwner(index)}
                    className="px-4 py-2 text-lg font-semibold text-primary-500 hover:text-primary-600 dark:text-primary-400 transition-colors border border-primary-700/50 hover:border-primary-600 rounded-lg bg-dark-100 dark:bg-vault-dark-4 hover:bg-dark-50 dark:hover:bg-vault-dark-3"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addOwner}
            className="mt-4 inline-flex items-center gap-4 text-lg font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 transition-colors px-4 py-2 rounded-lg border border-primary-700/50 hover:border-primary-600 bg-dark-100 dark:bg-vault-dark-4 hover:bg-dark-50 dark:hover:bg-vault-dark-3"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Owner
          </button>
        </div>

        {/* Threshold Section */}
        <div className="mb-8">
          <div className="mb-4">
            <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-2">
              Required Approvals (Threshold)
            </label>
            <p className="text-lg text-dark-500 dark:text-dark-400">
              Number of owner approvals required to execute a transaction
            </p>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="number"
              min={1}
              max={validOwnerCount}
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 1)}
              className="input-field w-24"
            />
            <span className="text-lg font-mono text-dark-500 dark:text-dark-400">
              of {validOwnerCount} owner{validOwnerCount !== 1 ? 's' : ''}
            </span>
          </div>
          
          {validOwnerCount > 0 && (
            <div className="mt-4 bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-300 dark:border-dark-600">
              <div className="flex items-center justify-between text-lg">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Current Configuration</span>
                <span className="text-dark-700 dark:text-dark-200 font-semibold">
                  <span className="text-primary-600 dark:text-primary-400">{threshold}</span>
                  <span className="text-dark-500 mx-2">of</span>
                  <span className="text-dark-600 dark:text-dark-300">{validOwnerCount}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mb-8 bg-gradient-to-r from-primary-900/90 via-primary-800/90 to-primary-900/90 border-l-4 border-primary-600 rounded-md p-5 shadow-red-glow">
            <div className="flex items-start gap-4">
              <svg className="w-5 h-5 text-primary-300 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-primary-200 mb-2">
                  Please fix the following errors:
                </h4>
                <ul className="space-y-1 text-lg text-primary-200">
                  {errors.map((error, index) => (
                    <li key={index} className="flex items-start gap-4">
                      <span className="text-primary-600 dark:text-primary-400 mt-0.5">•</span>
                      <span className="font-medium">{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="vault-divider pt-6">
          <div className="flex flex-wrap gap-4">
            <button
              type="submit"
              className="btn-primary flex-1 min-w-[200px] inline-flex items-center justify-center gap-4"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Continue to Deployment
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-secondary inline-flex items-center gap-4"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
