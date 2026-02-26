import { Component, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './config/wagmi';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { WalletDetail } from './pages/WalletDetail';
import { CreateWallet } from './pages/CreateWallet';
import { NewTransaction } from './pages/NewTransaction';
import { TransactionHistory } from './pages/TransactionHistory';
import { LookupTransaction } from './pages/LookupTransaction';

interface ErrorBoundaryProps {
  children: ReactNode;
}

/**
 * App-level error boundary — catches errors that escape all route boundaries.
 * Does not expose raw error details to users; logs to console for debugging.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, { hasError: boolean }> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-dark-50 dark:bg-vault-black p-4">
          <div className="vault-panel p-8 max-w-lg w-full text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary-900/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-display font-bold text-dark-800 dark:text-dark-100 mb-4">
              Something went wrong
            </h1>
            <p className="text-dark-600 dark:text-dark-400 mb-6">
              An unexpected error occurred. Error details have been logged to console.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Per-route error boundary — isolates page-level errors so the sidebar and
 * other routes remain functional when one page component throws.
 */
class RouteErrorBoundary extends Component<ErrorBoundaryProps, { hasError: boolean }> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RouteErrorBoundary caught a page error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <div className="w-12 h-12 mb-4 rounded-full bg-red-900/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-dark-800 dark:text-dark-100 mb-2">
            Page Error
          </h2>
          <p className="text-dark-500 dark:text-dark-400 mb-6 max-w-sm">
            This page encountered an unexpected error. Error details have been logged to console.
          </p>
          <Link to="/" className="btn-secondary text-sm">
            Return to Dashboard
          </Link>
        </div>
      );
    }

    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
      gcTime: 5 * 60 * 1000, // 5 minutes - garbage collect unused cache entries
    },
  },
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <ErrorBoundary>
            <Layout>
              <Routes>
                <Route path="/" element={<RouteErrorBoundary><Dashboard /></RouteErrorBoundary>} />
                <Route path="/create" element={<RouteErrorBoundary><CreateWallet /></RouteErrorBoundary>} />
                <Route path="/wallet/:address" element={<RouteErrorBoundary><WalletDetail /></RouteErrorBoundary>} />
                <Route path="/wallet/:address/transaction/new" element={<RouteErrorBoundary><NewTransaction /></RouteErrorBoundary>} />
                <Route path="/wallet/:address/history" element={<RouteErrorBoundary><TransactionHistory /></RouteErrorBoundary>} />
                <Route path="/wallet/:address/lookup" element={<RouteErrorBoundary><LookupTransaction /></RouteErrorBoundary>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ErrorBoundary>
        </Router>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
