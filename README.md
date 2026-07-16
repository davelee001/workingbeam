# Working Beam - Structural Analysis Tool

A full-stack web application for structural beam analysis and design supporting concrete (ACI 318) and steel (AISC) design codes.

## ✨ Features

- **Intuitive Input Interface**: Easy-to-use forms for beam geometry, material properties, and loads
- **Structural Analysis**: Automatic calculation of reactions, shear forces, and bending moments
- **Design Checks**: Flexural, shear, and deflection verification
- **Visual Diagrams**: Interactive charts showing shear force and bending moment diagrams
- **Multiple Design Codes**: Support for both ACI 318 (concrete) and AISC (steel)
- **Responsive Design**: Works on desktop and mobile devices

## 🛠️ Tech Stack

- **Backend**: Node.js 16+, Express.js, TypeScript
- **Frontend**: React 18, TypeScript, Recharts, Tailwind CSS
- **Development**: Concurrently for parallel server/client execution
- **Build**: npm workspaces pattern

## 📁 Project Structure

```
working-beam/
├── .vscode/
│   ├── tasks.json          # Development tasks
│   └── launch.json         # Debug configurations
├── server/                 # Express backend
│   ├── src/
│   │   ├── index.ts        # Server entry point
│   │   └── utils/
│   │       └── beamCalculations.ts
│   ├── dist/               # Compiled JavaScript
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── BeamInputForm.tsx
│   │   │   └── AnalysisResults.tsx
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── public/
│   ├── package.json
│   └── .env
├── .github/
│   └── copilot-instructions.md
├── package.json
├── README.md
└── .gitignore
```

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 16.0 or higher
- **npm**: Version 8.0 or higher

### Installation

1. Install root dependencies:
   ```bash
   npm install
   ```

2. Install server and client dependencies:
   ```bash
   cd server && npm install && cd ..
   cd client && npm install --legacy-peer-deps && cd ..
   ```

### Development

Start both servers:
```bash
npm run dev
```

Launches:
- **Backend**: http://localhost:5000
- **Frontend**: http://localhost:3000

### Individual Commands

- `npm run server:dev` - Start backend only
- `npm run client:dev` - Start frontend only
- `npm run build` - Build for production
- `npm run start` - Run production server

## 🔄 Workflow

The application implements the standard structural analysis workflow:

### 1. Input Details
- Beam geometry (span, width, depth in mm)
- Material selection (concrete or steel)
- Material properties (fc' for concrete, Fy for steel)
- Loads (dead, live, distributed, point)
- Support conditions (pin, roller, fixed)

### 2. Calculate Loads
- Compute self-weight
- Apply load factors per design code
- Combine load cases

### 3. Structural Analysis
- Calculate reaction forces
- Generate shear force diagram (V)
- Generate bending moment diagram (M)
- Compute deflections

### 4. Design Checks
- **Flexural**: Mu ≤ φMn
- **Shear**: Vu ≤ φVn  
- **Deflection**: Δ ≤ Δallowable
- **Serviceability**: Crack width, vibration

### 5. Output & Redesign
- View detailed calculations
- Interactive diagrams with Recharts
- Modify design and re-analyze

## 📊 API Documentation

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check |
| POST | `/api/analyze` | Beam analysis |

### Request Example

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
    "E": 25000
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

## 📋 Development Roadmap

### Phase 1: Foundation ✅
- [x] Project scaffolding
- [x] Basic UI structure
- [x] Server setup
- [ ] Basic calculations

### Phase 2: Core Analysis
- [ ] Reaction calculations
- [ ] Shear/moment diagrams
- [ ] Deflection methods

### Phase 3: Design Code
- [ ] ACI 318 checks
- [ ] AISC design
- [ ] Load combinations

### Phase 4: Advanced
- [ ] Reinforcement design
- [ ] Multiple spans
- [ ] Report generation

### Phase 5: Production
- [ ] Testing suite
- [ ] Optimization
- [ ] Database
- [ ] Cloud deployment

## 🏗️ Design Standards

- **ACI 318-19/22** - Structural Concrete
- **AISC 360-22** - Structural Steel
- **Future**: Eurocode 2/3, CSA standards

## 🐛 Troubleshooting

**PowerShell Execution Policy (Windows)**:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Port Already in Use**:
- Backend: Edit `PORT` in `server/.env`
- Frontend: React default is 3000

**Dependency Issues**:
```bash
cd client && npm install --legacy-peer-deps
```

## 📄 License

MIT License

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Run tests
4. Submit PR

---

**Status**: Early Development (Phase 1)  
**Last Updated**: 2026-07-15
