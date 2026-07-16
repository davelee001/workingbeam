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
- Password hashing with a unique salt and Node.js `scrypt`
- Random bearer sessions stored as SHA-256 hashes with expiration
- Role and resource-level authorization
- Payment request creation for an existing client account
- Client approval and escrow funding
- Beam Wallet API adapter using JSON-RPC 2.0 over HTTP
- Local mock wallet for development without real funds
- Transaction submission and explicit confirmation refresh
- Freelancer delivery notes
- Client escrow release to the freelancer wallet
- Dispute opening by either party while funds are held
- In-app notification outbox with email, SMS, and push channel intent
- Durable JSON storage with atomic file replacement
- Audit history for authentication, payment, escrow, and transaction activity
- Request-size limits, API rate limiting, and hidden Express signature
- Responsive freelancer/client dashboard

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

`funded` and `work_submitted` payments can enter `disputed`. Failed blockchain funding returns the request to `approved`; a failed release returns it to `work_submitted`. State checks prevent duplicate funding, approval, and release actions.

## Beam Integration

The production adapter follows the official [Beam Wallet Protocol API](https://www.beam.mw/docs/core-tech/beam-wallet-protocol-api), which exposes JSON-RPC 2.0 methods such as `tx_send`, `tx_status`, and `wallet_status`. WorkingBeam uses HTTP mode at the configured wallet endpoint.

When `BEAM_WALLET_API_URL` is omitted, the application uses a deterministic local mock:

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
- **Persistence:** atomic JSON store for the MVP
- **Authentication:** scrypt password hashes and expiring bearer sessions
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

An empty `BEAM_WALLET_API_URL` enables mock mode. Data is saved to `server/data/workingbeam.json` and excluded from Git.

### Run

```bash
npm run dev
```

- Web app: <http://localhost:3000>
- API: <http://localhost:5000>
- Health and wallet mode: <http://localhost:5000/api/health>

The client must exist before a freelancer can address a payment request to the client's email. For a local end-to-end test, register a client account, sign out, register a freelancer account, and create a request using the client's email.

### Test and Build

```bash
npm test --prefix server
npm run build
```

The test suite covers authentication, password storage, duplicate accounts, request creation, authorization, the complete escrow lifecycle, transaction confirmation, disputes, duplicate-action protection, notification creation, and audit events.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | API listen port |
| `CLIENT_ORIGIN` | any origin in development | Comma-separated allowed browser origins |
| `DATA_FILE` | `./data/workingbeam.json` | Persistent MVP data file |
| `BEAM_WALLET_API_URL` | empty | Live endpoint, for example `https://wallet.internal/api/wallet` |
| `BEAM_WALLET_API_KEY` | empty | Wallet API ACL key |
| `BEAM_ESCROW_ADDRESS` | empty | Custodial escrow wallet address/token |
| `BEAM_GROTH_PER_BEAM` | `100000000` | Atomic-unit conversion, deployment configurable |
| `BEAM_TX_FEE_GROTH` | `100000` | Transaction fee supplied to `tx_send` |

## API Summary

### Public

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | API and wallet-adapter status |
| `POST` | `/api/auth/register` | Create freelancer/client account |
| `POST` | `/api/auth/login` | Create session |

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
- Put the API behind HTTPS, a reverse proxy, and distributed rate limiting.
- Add email/phone verification, MFA, password reset, and session management.
- Connect the notification outbox to production email, SMS, and push providers.
- Add signed webhooks or a background confirmation worker instead of manual refresh.
- Add an administrator/arbitrator workflow for disputes and refunds.
- Implement ledger reconciliation, withdrawal controls, and wallet balance monitoring.
- Obtain an independent application and smart-custody security audit.
- Complete legal review for escrow/custody and applicable KYC/AML obligations.

## License

MIT

**Status:** Working local MVP with mock or HTTP Beam Wallet API modes.

**Last updated:** 2026-07-16
