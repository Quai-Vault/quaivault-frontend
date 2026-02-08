# Changelog

## Unreleased

### Rebranding
- Renamed from "Multisig Wallet" to **QuaiVault** across the entire application
- Updated contract ABIs to use new QuaiVault naming conventions
- Updated site metadata, Open Graph tags, sitemap, and robots.txt

### Transaction History
- **Collapsible transaction cards** — Transaction, cancelled, and social recovery cards now show a compact summary by default. Click to expand for full details (To address, approvals, contract data, etc.)
- **Module bypass transactions** — Whitelist and daily limit transactions now appear in the Executed Transactions tab with "via Whitelist" or "via Daily Limit" badges
- **Social Recovery tab** — New tab showing all recovery operations (pending, executed, cancelled) with:
  - Guardian approval records with active/revoked status indicators
  - Full proposed new owner configuration with numbered address list
  - New threshold display (e.g., "2 of 3")
  - Copy buttons on all addresses and transaction hashes
- **Copy buttons** added to To addresses and approver addresses across all tabs

### Social Recovery Module
- **Real-time config updates** — Recovery configuration now updates immediately after setup (previously required a page refresh)
- **Cancel button spinner** — The cancel button in Social Recovery Management now shows a loading spinner during pending cancellation
- **Refresh button animation** — The refresh pending recoveries button now animates while loading

### Wallet Management
- **Collapsible sidebar** with persistent state
- **Improved wallet creation flow** with salt mining for deterministic deployment
- **Deduplicated wallet list** — Prevents duplicate entries when the same wallet appears from multiple sources

### UI/UX Improvements
- **Modal z-index fix** — Modals now render via a portal, preventing them from being clipped by parent containers
- **Improved theme toggle** — Simplified dark/light mode switching
- **Browser notification support** — Optional desktop notifications for transaction events (with user opt-in toggle)
- **Transaction flow overlay** for improved transaction submission feedback
- **Confirmation dialogs** added to destructive actions (module disable, owner removal, cancel recovery)
- **CSP header** updated for improved security

### Infrastructure
- **Project restructured** — Frontend moved from `frontend/` subdirectory to repository root; contracts separated into their own repository
- **MIT License** added
- **Service worker** added for offline caching support
- **Simplified gas estimation** with streamlined error handling
