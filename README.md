# Working Beam

Working Beam is a full-stack structural beam analysis and preliminary design application. It calculates reactions, shear, bending moment, and elastic deflection, then performs reinforced-concrete checks using ACI 318-19 and structural-steel checks using AISC 360-22 LRFD.

> **Engineering notice:** This software is intended for education, development, and preliminary design. Results must be reviewed by a qualified structural engineer before they are used for construction or other safety-critical decisions.

## Features

- Reactions for simply supported beams and single-end cantilevers
- Point loads, full-span uniform loads, and partial uniform loads
- Shear-force and bending-moment diagrams
- Numerical elastic-deflection integration for mixed load cases
- Service-load results and strength-design load combinations
- ACI 318-19 flexural reinforcement and shear-stirrup design
- AISC 360-22 LRFD flexural, shear, compactness, and web-buckling checks
- Deflection limit check using `L/360`
- Interactive React charts for analysis results
- Input validation with descriptive API errors
- Closed-form benchmark tests for the calculation engine

## Analysis Scope

### Supported systems

- One simply supported span with pin/roller end supports
- One cantilever with a fixed support at either end
- Prismatic members with constant material and section properties

Continuous beams, middle supports, fixed-fixed beams, and other indeterminate systems are rejected rather than approximated with statics-only results.

### Loads and units

| Input | Unit | Notes |
|---|---:|---|
| Span and load position | m | Positions are measured from the left end |
| Section width/depth | mm | RC depth is treated as effective depth `d` |
| Point load | kN | Requires `position` |
| Dead/live/distributed load | kN/m | Full span by default |
| Stress (`fc`, `fy`) | MPa | Positive values only |
| Elastic modulus (`E`) | GPa or MPa | Values up to 1000 are interpreted as GPa |
| Reactions/shear | kN | Upward reaction is positive |
| Moment | kN-m | Sagging moment is positive |
| Deflection | mm | Reported as an absolute maximum |

A partial uniform load can include `position` as its start and `endPosition` as its end. Load direction defaults to `down`.

### Design assumptions

- Service diagrams use the loads supplied by the request.
- Strength demand is enveloped from `1.4D` and `1.2D + 1.6L`.
- Loads typed as `point` or `distributed` are treated as already combined and use a factor of `1.0`.
- Concrete design uses ACI 318-19 tension-controlled flexure, minimum/maximum longitudinal steel, one-way shear strength, and two-leg stirrup selection.
- Steel design uses AISC 360-22 LRFD. Complete flange/web properties enable compactness and web shear-buckling checks.
- A steel section with omitted flange/web properties uses a clearly reported solid-rectangular fallback.
- A nonzero unbraced length requires section torsion/warping properties for a complete lateral-torsional buckling check; the application reports that check as unverified.

## Technology

- **Backend:** Node.js, Express, TypeScript
- **Frontend:** React 18, TypeScript, Recharts
- **Testing:** Node's built-in test runner
- **Development:** Concurrent backend/frontend processes

## Project Structure

```text
working-beam/
|-- client/
|   |-- public/
|   |-- src/
|   |   |-- components/
|   |   |   |-- AnalysisResults.tsx
|   |   |   `-- BeamInputForm.tsx
|   |   |-- App.tsx
|   |   `-- index.tsx
|   |-- package.json
|   `-- tsconfig.json
|-- server/
|   |-- src/
|   |   |-- types/cors.d.ts
|   |   |-- utils/beamCalculations.ts
|   |   `-- index.ts
|   |-- test/beamCalculations.test.mjs
|   |-- package.json
|   `-- tsconfig.json
|-- package.json
`-- README.md
```

## Getting Started

### Prerequisites

- Node.js 18 or newer (Node.js 24 is supported)
- npm 10 or newer

### Install

```bash
npm install
npm install --prefix server
npm install --prefix client --legacy-peer-deps
```

For reproducible CI installs, replace `install` with `ci`.

### Run in development

```bash
npm run dev
```

- Frontend: <http://localhost:3000>
- API: <http://localhost:5000>
- Health check: <http://localhost:5000/api/health>

Individual processes can be started with:

```bash
npm run server:dev
npm run client:dev
```

### Test and build

```bash
npm test --prefix server
npm run build
```

The server suite verifies reactions, point and uniform load diagrams, partial UDLs, cantilever equilibrium, numerical deflection against a closed-form solution, ACI reinforcement, AISC capacity, full analysis output, and invalid-input handling.

To run the compiled API after a production build:

```bash
npm start
```

## API

### `GET /api/health`

Returns the server status.

### `POST /api/analyze`

Concrete example:

```json
{
  "geometry": {
    "span": 5,
    "width": 300,
    "depth": 500
  },
  "materials": {
    "type": "concrete",
    "fc": 30,
    "fy": 420
  },
  "loads": [
    {
      "type": "dead",
      "value": 20,
      "direction": "down"
    }
  ],
  "supports": [
    { "position": "left", "type": "pin" },
    { "position": "right", "type": "roller" }
  ]
}
```

Point and partial distributed loads:

```json
{
  "loads": [
    {
      "type": "point",
      "value": 40,
      "position": 3,
      "direction": "down"
    },
    {
      "type": "distributed",
      "value": 8,
      "position": 1,
      "endPosition": 4,
      "direction": "down"
    }
  ]
}
```

The response contains:

- `reactions`: vertical and fixed-end reactions
- `diagrams`: position, shear, moment, and deflection points
- `maximumShear`, `maximumMoment`, and `maximumDeflection`
- `designLoads`: factored maximum shear and moment
- `checks`: flexure, shear, and deflection pass/fail values
- `design`: ACI reinforcement details or AISC capacities and warnings

## Troubleshooting

### PowerShell blocks `npm.ps1`

Use `npm.cmd` in place of `npm`, or update the current-user execution policy:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Client dependency resolution fails

The React 18/Create React App dependency tree uses legacy peer relationships:

```bash
npm install --prefix client --legacy-peer-deps
```

### Port already in use

- Set `PORT` for the backend; the default is `5000`.
- Create React App uses port `3000` and will offer another port when run interactively.

## Standards

- [ACI 318-19 (reapproved 2022)](https://www.concrete.org/store/productdetail.aspx?ItemID=318U19)
- [ANSI/AISC 360-22](https://www.aisc.org/aisc/publications/current-standards/aisc-360/)

## Roadmap

- Matrix-stiffness analysis for continuous and indeterminate beams
- Selected AISC shape database and complete lateral-torsional buckling design
- Additional load combinations and jurisdiction-specific configuration
- Concrete cracked-section serviceability calculations
- Detailed calculation reports and export
- Eurocode and CSA design modules

## License

MIT

## Contributing

1. Create a feature branch.
2. Make focused changes with tests.
3. Run `npm test --prefix server` and `npm run build`.
4. Open a pull request describing the engineering assumptions affected.

**Project status:** Core single-span analysis and preliminary ACI/AISC design implemented.

**Last updated:** 2026-07-16
