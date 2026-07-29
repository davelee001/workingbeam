# WorkingBeam

WorkingBeam is a privacy-focused freelancer payment and custodial escrow
platform built around the Beam blockchain payment rail.

## Product boundaries

- WorkingBeam is not a structural engineering or beam-analysis project.
- Do not add structural engineering calculations, ACI checks, AISC checks, beam diagrams, or design-code engines.
- Escrow is custodial: do not describe the product as fully decentralized.
- Beam provides wallet integration, private payment capability, and transaction confirmation.

## Core users

- Freelancers
- Clients
- Administrators

## Core workflow

1. Freelancer creates a payment request.
2. Client approves the request.
3. Client funds custodial escrow using Beam.
4. Freelancer submits completed work.
5. Client releases payment.
6. Both parties receive transaction confirmation.

## Engineering priorities

- Protect wallet credentials and user data.
- Never expose server secrets to the client.
- Preserve server-side payment-state validation.
- Add tests for financial actions.
- Use the Beam mock wallet only in development.
