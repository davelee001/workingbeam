# WorkingBeam

WorkingBeam is a freelancer payment-request and escrow platform built around the privacy-focused Beam blockchain. Freelancers request payment, clients approve and fund escrow, funds are tracked through blockchain confirmation, and clients release payment after work is delivered.

## Architecture

```text
                    Users

            Freelancer      Client

                  |          |
                  +----+-----+
                       |
                       v
              WorkingBeam Web App
                       |
                       v
             Authentication Service
                       |
                       v
              Payment Request API
                       |
                       v
                Escrow Service
                       |
                       v
             Beam Wallet Integration
                       |
                       v
                Beam Blockchain
                       |
                       v
            Transaction Confirmation
                       |
                       v
             Notification Outbox
                       |
                +------+------+
                |      |      |
              Email   SMS    Push
```

## Implemented

- Freelancer and client registration
- Optional six-digit email activation codes delivered through SMTP, stored only as HMAC hashes protected by a server-side pepper, and guarded by expiry, resend throttling, and attempt limits
- Password hashing with a unique salt and Node.js `scrypt`
- Random bearer sessions stored as SHA-256 hashes with expiration
- Role and resource-level authorization
- Payment request creation for an existing client account with USD, EUR, GBP, SSP, UGX, KSH, TSH, and SDG request currencies
- Generated payment links and QR codes for sharing requests with clients
- Client approval and escrow funding
- Beam Wallet API adapter using JSON-RPC 2.0 over HTTP
- Server-side Beam address and payment-token validation through `validate_address` before account activation and transfers
- Local mock wallet for development without real funds
- Transaction submission and explicit confirmation refresh
- Freelancer delivery notes
- Client escrow release to the freelancer wallet
- Downloadable text receipts for paid requests
- Failed and expired payment request states with dashboard filters and notifications
- Dispute opening by either party while funds are held
- In-app notification outbox with email, SMS, and push channel intent
- Public website with Landing, About, Features, Pricing, Documentation, and Contact pages
- Contact inquiry capture with validation, rate limiting, bot honeypot handling, JSON persistence, and audit logging
- Durable JSON storage with atomic file replacement
- Audit history for authentication, payment, escrow, and transaction activity
- Request-size limits, API rate limiting, and hidden Express signature
- Production HTTPS enforcement through `FORCE_HTTPS=true` behind a trusted proxy
- Push notification webhook delivery adapter with production HTTPS validation
- Basic fraud detection that blocks high-risk payment-request amounts and same-day request velocity
- Responsive freelancer/client workspace with dedicated Overview, Payments, and Wallet screens

## Product Screens

### Public Website

Unauthenticated visitors now land on a full public website instead of the sign-in screen:

- **Landing page:** product positioning, protected payment workflow, and role-specific entry points
- **About:** purpose, operating values, and the user-to-blockchain architecture
- **Features:** payment requests, escrow, Beam confirmation, disputes, wallet validation, audit history, and notifications
- **Pricing:** beta pricing preview with clear notice that automated billing is not active yet
- **Documentation:** local setup, payment lifecycle, Wallet API configuration, and security notes
- **Contact:** validated inquiry form for product, integration, security, and partnership messages

Sign in remains available at `/auth`; account creation is available at `/auth?mode=register`.

### Overview

The Overview screen is the operating summary for either role:

- Total requested, protected escrow, and confirmed payment metrics
- Monthly revenue, active contracts, spending/pipeline analytics, and attention-needed counts
- Beam wallet connection mode
- Recent payment activity and current lifecycle state
- Direct access to payment creation for freelancers
- Approval, funding, delivery, release, dispute, and confirmation actions where applicable

### Payments

The Payments screen provides the full escrow workspace:

- Counts for all, active, escrowed, completed, and disputed requests
- Filters for `all`, `active`, `escrow`, `completed`, and `disputed`
- Request currency selector supports `USD`, `EUR`, `GBP`, `SSP`, `UGX`, `KSH`, `TSH`, and `SDG`
- Full request history instead of the Overview subset
- Counterparty, amount, delivery note, transaction ID, and timeline details
- Generated payment link and QR code on every request card
- Download receipt action after a request reaches paid/released status
- Role-aware actions with server-side authorization and state validation

Latest payment-sharing update:

- New requests default to `USD` when a freelancer does not choose a currency.
- Payment links open the authenticated payment workspace and route signed-in users to the Payments screen.
- QR codes are shown beside generated payment links and collapse neatly on mobile screens.
- Paid/released receipts include request title, amount, currency, parties, created date, due date when available, transaction reference, and payment link.

### Wallet

The Wallet screen presents the Beam-facing view:

- Mock or live Wallet API connection status
- Current user's Beam receiving address with copy action
- Generated Beam wallet/deposit address support through the wallet adapter
- Deposit address panel for receiving BEAM
- Standalone send-payment form for direct BEAM transfers outside escrow
- Protected escrow and confirmed transaction totals
- Funding and release transaction history
- On-chain transaction state and wallet transaction IDs
- Security guidance explaining that WorkingBeam never requests a wallet seed phrase

### Transactions

The Transactions screen separates blockchain activity from the wallet summary:

- Total, confirmed, pending, and failed transaction counts
- Full funding and release history across all visible payment requests
- Complete wallet transaction IDs for reconciliation
- Empty state that routes users back to payment activity

Client users also have a dedicated **Payment History** screen that combines completed requests with payment requests that have wallet transaction activity.

### Escrow

The Escrow screen focuses only on protected or release-relevant requests:

- Approved requests ready for funding
- Funding-pending requests waiting for confirmation
- Held escrow value in BEAM
- Disputed requests and release-pending work

Client users also have a dedicated **Outstanding Requests** screen for requests that still need approval, funding, review, release, confirmation, or dispute attention.

### Settings and Profile

The Settings screen gives each signed-in user an account controls area:

- Authentication and verification state
- Notification coverage
- Mock or live wallet mode
- Security summary for role, ownership, wallet, and payment-state checks

The Profile screen opens in read-only review mode first. It shows the account details and keeps the edit action below those details so users are not forced into editing just by opening their profile. Selecting **Edit profile** reveals the form, and **Save changes** refreshes the dashboard data in place while keeping the user on the Profile screen.

- Display name
- Optional phone number
- Beam receiving address or payment token
- Server-side wallet validation when the wallet value changes
- Inline save errors when profile details cannot be saved

### Notifications

The notification panel is available from every authenticated screen. It displays payment, delivery, dispute, release, and confirmation events addressed to the signed-in account.

The interface balances dark forest-green product areas with a rich Beam-pink header and deeper dusty-pink surfaces across navigation, cards, authentication, forms, notifications, and dialogs.

## Payment Lifecycle

```text
pending
  -> approved
  -> funding_pending
  -> funded
  -> work_submitted
  -> release_pending
  -> released
```

`funded` and `work_submitted` payments can enter `disputed`. Failed blockchain funding or release confirmations mark the request as `failed` for clear user-facing recovery. State checks prevent duplicate funding, approval, and release actions.

Failed wallet confirmations now mark the visible payment request as `failed` so either party can spot the issue from Payments, Outstanding Requests, History, and notifications. Pending or approved requests whose due date has passed are automatically marked `expired` when payment data is loaded.

The UI now also surfaces due dates directly on request cards, gives failed/expired recovery hints, and summarizes failed/expired items in client history.

Latest reliability and analytics update:

- Payment requests now have visible `failed` and `expired` states instead of hiding those conditions inside transaction history.
- Expired requests notify both freelancer and client when overdue pending/approved work is detected.
- The dashboard now separates revenue, active contracts, pending spend/pipeline, and attention-needed counts.
- Notification cards show intended delivery channels, including in-app, email, SMS, and push where configured by the event.

## Beam Integration

The production adapter follows the official [Beam Wallet Protocol API](https://www.beam.mw/docs/core-tech/beam-wallet-protocol-api), which exposes JSON-RPC 2.0 methods such as `validate_address`, `tx_send`, `tx_status`, and `wallet_status`. WorkingBeam uses HTTP mode at the configured wallet endpoint. Browser-provided Beam strings are never accepted by length alone: live mode asks the wallet to validate their curve data and remaining payment-token capacity.

When `BEAM_WALLET_API_URL` is omitted in development, the application uses a deterministic local mock. Production fails closed instead of starting in mock mode:

- Transfers receive a generated mock transaction ID.
- The first confirmation refresh marks the transaction confirmed.
- No real BEAM is moved.

For a live wallet:

1. Run Beam `wallet-api` with HTTP enabled.
2. Enable TLS, an IP allowlist, and Wallet API ACL.
3. Configure a server-side write-capable ACL key.
4. Set the custodial escrow wallet address.
5. Keep the wallet database, password, seed, and ACL key outside this repository.

This MVP implements a custodial escrow workflow. A production launch also requires jurisdiction-specific custody, dispute, KYC/AML, accounting, and consumer-protection review.

## Technology

- **Web:** React 18, TypeScript, Create React App
- **API:** Node.js, Express, TypeScript
- **Persistence:** atomic JSON store for local development or Supabase Postgres JSONB state for hosted deployment
- **Authentication:** scrypt password hashes and expiring bearer sessions
- **Email:** SMTP through Nodemailer with hashed, expiring activation codes
- **Push:** payment events include push channel intent; a production push provider still needs to be connected for device delivery
- **HTTPS:** production startup requires explicit HTTPS enforcement so deployments do not accidentally serve the API over plain HTTP
- **Fraud:** high-value and high-velocity payment request creation is blocked and audited for manual review
- **Blockchain:** Beam Wallet API JSON-RPC adapter
- **Tests:** Node.js built-in test runner

## Project Structure

```text
working-beam/
|-- client/
|   |-- public/index.html
|   |-- src/
|   |   |-- App.tsx
|   |   |-- App.css
|   |   |-- PublicSite.tsx
|   |   |-- PublicSite.css
|   |   `-- index.tsx
|   |-- package.json
|   `-- tsconfig.json
|-- server/
|   |-- src/
|   |   |-- domain/types.ts
|   |   |-- persistence/jsonStore.ts
|   |   |-- services/
|   |   |   |-- beamWallet.ts
|   |   |   `-- platformService.ts
|   |   |-- app.ts
|   |   `-- index.ts
|   |-- test/platform.test.mjs
|   |-- supabase.schema.sql
|   |-- .env.example
|   |-- package.json
|   `-- tsconfig.json
|-- package.json
`-- README.md
```

## Getting Started

### Requirements

- Node.js 18 or newer
- npm 10 or newer

### Install

```bash
npm install
npm install --prefix server
npm install --prefix client --legacy-peer-deps
```

### Configure

PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

Bash:

```bash
cp server/.env.example server/.env
```

The example uses console email delivery, paused email verification, and a mock Beam wallet. By default, data is saved to `server/data/workingbeam.json` and excluded from Git. Local `.env` files are ignored and must never be committed.

### Supabase Database

To use Supabase instead of the local JSON file:

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run the SQL in `server/supabase.schema.sql`.
4. Copy the project URL and service-role key from Supabase project settings.
5. Set these server environment variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STATE_ROW_ID=default
```

`SUPABASE_SERVICE_ROLE_KEY` is a server-only secret. Do not expose it in the React client or commit it to Git.

After restarting the backend, confirm Supabase is active by opening `/api/health` or `/health` and checking:

```json
"database": { "mode": "supabase" }
```

If a service-role key was shared in chat, screenshots, or logs, rotate it in Supabase after setup is confirmed because it has server-side database privileges.

For a real deployment, set `NODE_ENV=production`, configure a random verification-code pepper, SMTP, a TLS-protected Beam Wallet API, an ACL key, and a valid escrow token. Email verification defaults to enabled in production unless explicitly overridden. Startup fails if required production security configuration is missing.

### Run

```bash
npm run dev
```

- Public website: <http://localhost:3000>
- Sign in: <http://localhost:3000/auth>
- API: <http://localhost:5000>
- Health, database mode, and wallet mode: <http://localhost:5000/api/health>

The client must exist before a freelancer can address a payment request to the client's email. For a local end-to-end test, register a client account, sign out, register a freelancer account, and create a request using the client's email.

### Local Workflow Walkthrough

1. Register a **client** with a Beam wallet address or development token.
2. Sign out and register a **freelancer** using a different email. When verification is enabled, enter the six-digit code from email or the development API console.
3. From Overview or Payments, create a request using the client's email.
4. Sign in as the client and approve the request.
5. Fund escrow. In mock mode, a mock Beam transaction ID is generated.
6. Select **Check confirmation** to move the request to `funded`.
7. Sign in as the freelancer and submit a delivery note or work link.
8. Sign in as the client and release payment.
9. Refresh the release transaction to confirm it and complete the request.
10. Review the transaction on the Wallet screen and notifications from the top navigation.

### Test and Build

```bash
npm test --prefix server
npm run build
```

The test suite covers email-code hashing, expiry and lockout, unverified login blocking, Beam address-provider validation, password storage, duplicate accounts, request authorization, the complete escrow lifecycle, generated wallet/deposit addresses, standalone wallet sends, transaction confirmation, disputes, notification creation, contact inquiry capture, bot honeypot handling, and audit events.

### Current Verification

- 19 security and platform tests passing
- Server TypeScript build passing
- React production build passing
- Responsive navigation available on desktop and mobile
- Mock wallet health available from `/api/health`

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | API listen port |
| `CLIENT_ORIGIN` | any origin in development | Comma-separated allowed browser origins |
| `DATA_FILE` | `./data/workingbeam.json` | Persistent MVP data file |
| `SUPABASE_URL` | empty | Supabase project URL; enables hosted persistence when paired with a service-role key |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Server-only Supabase service-role key used to read/write `workingbeam_state` |
| `SUPABASE_STATE_ROW_ID` | `default` | Logical row ID for the JSONB state document |
| `TRUST_PROXY` | empty | Trusted reverse-proxy hop count; set deliberately for accurate client IP rate limiting |
| `FORCE_HTTPS` | `false` in development; required as `true` in production | Rejects non-HTTPS requests behind a trusted reverse proxy |
| `VERIFICATION_CODE_PEPPER` | development value | Random secret of at least 32 characters that protects stored email-code hashes |
| `REQUIRE_EMAIL_VERIFICATION` | `false` in example; production defaults to `true` | Enables email-code activation without removing the verification implementation |
| `SMTP_URL` | empty in development | `smtp://` or `smtps://` delivery URL; mandatory in production |
| `EMAIL_FROM` | example sender | Verified sender used for activation messages |
| `PUSH_WEBHOOK_URL` | empty in development | HTTPS push-provider webhook; mandatory in production |
| `PUSH_WEBHOOK_TOKEN` | empty | Optional bearer token sent to the push webhook |
| `BEAM_WALLET_API_URL` | empty | Live endpoint, for example `https://wallet.internal/api/wallet` |
| `BEAM_WALLET_API_KEY` | empty | Wallet API ACL key |
| `BEAM_ESCROW_ADDRESS` | empty | Custodial escrow wallet address/token |
| `BEAM_GROTH_PER_BEAM` | `100000000` | Atomic-unit conversion, deployment configurable |
| `BEAM_TX_FEE_GROTH` | `100000` | Transaction fee supplied to `tx_send` |

## API Summary

### Public

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api` | API index with available public and authenticated routes |
| `GET` | `/api/health` | API, database, wallet, email, push, and HTTPS-enforcement status |
| `GET` | `/health` | Health-check alias for browser and uptime monitors with the same payload |
| `POST` | `/api/contact` | Store a validated public contact inquiry |
| `POST` | `/api/auth/register` | Create freelancer/client account |
| `POST` | `/api/auth/verify-email` | Activate an account with the emailed six-digit code |
| `POST` | `/api/auth/resend-verification` | Send a replacement code after the resend cooldown |
| `POST` | `/api/auth/login` | Create a session for a verified account |
| `POST` | `/api/wallet/generate` | Generate and save a Beam receiving address for the signed-in account |
| `GET` | `/api/wallet/deposit-address` | Return the current receiving/deposit address |
| `GET` | `/api/wallet/transactions` | List escrow and standalone wallet transactions visible to the user |
| `POST` | `/api/wallet/send` | Submit a standalone BEAM wallet transfer |

### Authenticated

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/auth/me` | Current account |
| `POST` | `/api/auth/logout` | Revoke current session |
| `GET` | `/api/payment-requests` | Requests involving current user |
| `POST` | `/api/payment-requests` | Freelancer creates request |
| `POST` | `/api/payment-requests/:id/approve` | Client approves |
| `POST` | `/api/payment-requests/:id/fund` | Client funds escrow |
| `POST` | `/api/payment-requests/:id/submit-work` | Freelancer delivers work |
| `POST` | `/api/payment-requests/:id/release` | Client releases escrow |
| `POST` | `/api/payment-requests/:id/dispute` | Either party opens dispute |
| `POST` | `/api/transactions/:id/refresh` | Refresh Beam confirmation |
| `GET` | `/api/notifications` | Current user's notification outbox |
| `POST` | `/api/notifications/:id/read` | Mark notification read |

Send authenticated requests with:

```http
Authorization: Bearer <session-token>
```

## Security and Production Work

The repository is a functional MVP, not a production custody deployment. Before real funds are accepted:

- Replace JSON storage with PostgreSQL and database transactions.
- Store session and wallet secrets in a managed secret store.
- Put the API behind a managed TLS reverse proxy and distributed rate limiting.
- Add phone verification, MFA, password reset, and user-facing session management.
- Connect SMS delivery and provider-specific push token registration.
- Add signed webhooks or a background confirmation worker instead of manual refresh.
- Add an administrator/arbitrator workflow for disputes and refunds.
- Implement ledger reconciliation, withdrawal controls, and wallet balance monitoring.
- Obtain an independent application and smart-custody security audit.
- Complete legal review for escrow/custody and applicable KYC/AML obligations.

## License

MIT

**Status:** Working local MVP with role-based screens, complete mock escrow lifecycle, and mock or HTTP Beam Wallet API modes.

**Last updated:** 2026-07-18
