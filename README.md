# WorkingBeam

[![CI](https://github.com/davelee001/workingbeam/actions/workflows/ci.yml/badge.svg)](https://github.com/davelee001/workingbeam/actions/workflows/ci.yml)

WorkingBeam is a privacy-focused freelancer payment and escrow platform
built around the Beam blockchain.

## Core users

- Freelancers
- Clients
- Administrators

## Core workflow

1. Freelancer creates payment request.
2. Client approves request.
3. Client funds escrow using Beam.
4. Freelancer submits completed work.
5. Client releases payment.
6. Both parties receive transaction confirmation.

## Technology

- React and TypeScript frontend
- Node.js, Express and TypeScript backend
- Supabase PostgreSQL for hosted persistence
- Beam Wallet API using JSON-RPC 2.0

## Priorities

- Protect wallet credentials and user data.
- Never expose server secrets to the client.
- Preserve payment-state validation.
- Add tests for all financial actions.
- Use the Beam mock wallet only in development.
- Do not implement structural engineering calculations.

## Status

WorkingBeam is maintained as a freelancer escrow/payment product, not a structural engineering tool.

Last updated: 2026-07-29
