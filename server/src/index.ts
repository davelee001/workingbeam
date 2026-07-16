import express from 'express';
import cors from 'cors';
import { analyzeBeam } from './utils/beamCalculations.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Beam Analysis Routes
app.post('/api/analyze', (req, res) => {
  try {
    const { geometry, materials, loads, supports } = req.body;
    if (!geometry || !materials || !Array.isArray(loads) || !Array.isArray(supports)) {
      res.status(400).json({ error: 'geometry, materials, loads, and supports are required' });
      return;
    }
    res.json(analyzeBeam(geometry, materials, loads, supports));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    res.status(400).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
