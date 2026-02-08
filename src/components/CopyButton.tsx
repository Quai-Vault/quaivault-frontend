import { useState, useRef, useEffect } from 'react';
import { copyToClipboard } from '../utils/clipboard';
import { TIMING } from '../config/contracts';

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  copiedText?: string;
  title?: string;
}

export function CopyButton({
  text,
  className = '',
  size = 'md',
  showText = false,
  copiedText = 'Copied!',
  title = 'Copy to clipboard',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), TIMING.COPY_FEEDBACK);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-2 text-primary-500 hover:text-primary-400 transition-colors p-1 rounded hover:bg-dark-100 dark:hover:bg-vault-dark-3 flex-shrink-0 ${className}`}
      title={title}
      aria-label={title}
    >
      {copied ? (
        <>
          <svg className={sizeClasses[size]} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {showText && <span className="text-xs">{copiedText}</span>}
        </>
      ) : (
        <>
          <svg className={sizeClasses[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {showText && <span className="text-xs">Copy</span>}
        </>
      )}
    </button>
  );
}
