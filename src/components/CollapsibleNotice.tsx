import { useState } from 'react';

type NoticeVariant = 'info' | 'success' | 'warning';

interface CollapsibleNoticeProps {
  title: string;
  children: React.ReactNode;
  variant?: NoticeVariant;
  defaultExpanded?: boolean;
}

const variantStyles: Record<NoticeVariant, { container: string; icon: string; title: string; content: string }> = {
  info: {
    container: 'bg-blue-50 dark:bg-gradient-to-r dark:from-blue-900/90 dark:via-blue-800/90 dark:to-blue-900/90 border-l-4 border-blue-500 dark:border-blue-600',
    icon: 'text-blue-600 dark:text-blue-400',
    title: 'text-blue-800 dark:text-blue-200',
    content: 'text-blue-700 dark:text-blue-200/90',
  },
  success: {
    container: 'bg-green-50 dark:bg-gradient-to-r dark:from-green-900/90 dark:via-green-800/90 dark:to-green-900/90 border-l-4 border-green-500 dark:border-green-600',
    icon: 'text-green-600 dark:text-green-400',
    title: 'text-green-800 dark:text-green-200',
    content: 'text-green-700 dark:text-green-200/90',
  },
  warning: {
    container: 'bg-yellow-50 dark:bg-gradient-to-r dark:from-yellow-900/90 dark:via-yellow-800/90 dark:to-yellow-900/90 border-l-4 border-yellow-500 dark:border-yellow-600',
    icon: 'text-yellow-600 dark:text-yellow-400',
    title: 'text-yellow-800 dark:text-yellow-200',
    content: 'text-yellow-700 dark:text-yellow-200/90',
  },
};

const variantIcons: Record<NoticeVariant, React.ReactNode> = {
  info: (
    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
  ),
  success: (
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  ),
  warning: (
    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
  ),
};

export function CollapsibleNotice({ title, children, variant = 'info', defaultExpanded = false }: CollapsibleNoticeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const styles = variantStyles[variant];

  return (
    <div className={`${styles.container} rounded-md overflow-hidden`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
        type="button"
      >
        <svg className={`w-5 h-5 ${styles.icon} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
          {variantIcons[variant]}
        </svg>
        <span className={`text-sm font-semibold ${styles.title} flex-1`}>{title}</span>
        <svg
          className={`w-4 h-4 ${styles.icon} transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className={`px-4 pb-3 text-sm ${styles.content}`}>
          <div className="pl-8">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
