import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useThemeStore } from './store/themeStore'
import { validateContractConfig } from './config/contracts'

// Initialize theme before render to set up system preference listener
useThemeStore.getState().initializeTheme()

// Validate contract configuration at startup
const configErrors = validateContractConfig();
if (configErrors.length > 0) {
  console.error(
    '%c[QuaiVault] Contract configuration errors:',
    'color: red; font-weight: bold',
    '\n' + configErrors.map(e => `  - ${e}`).join('\n')
  );
}

// Ensure root element exists before mounting React
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Cannot mount React app.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
