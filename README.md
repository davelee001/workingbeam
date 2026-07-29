# WorkingBeam

[![CI](https://github.com/davelee001/workingbeam/actions/workflows/ci.yml/badge.svg)](https://github.com/davelee001/workingbeam/actions/workflows/ci.yml)

WorkingBeam is a privacy-focused freelancer payment and custodial escrow platform
built around the Beam blockchain payment rail.

## Core users

- Freelancers
- Clients
- Administrators

## Core workflow

1. Freelancer creates payment request.
2. Client approves request.
3. Client funds custodial escrow using Beam.
4. Freelancer submits completed work.
5. Client releases payment.
6. Both parties receive transaction confirmation.

## Technology

- React and TypeScript frontend
- Node.js, Express and TypeScript backend
- Supabase PostgreSQL for hosted persistence
- Beam Wallet API using JSON-RPC 2.0

## Continuous integration

Every push and pull request runs the Node.js 20 CI workflow.

## Priorities

- Protect wallet credentials and user data.
- Never expose server secrets to the client.
- Preserve payment-state validation.
- Add tests for all financial actions.
- Use the Beam mock wallet only in development.
- Do not implement structural engineering calculations.
- Do not describe escrow as fully decentralized; it is custodial.

## Status

WorkingBeam is maintained as a freelancer custodial escrow/payment product, not a structural engineering tool.

Last updated: 2026-07-29
