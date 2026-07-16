import express from 'express';
import cors from 'cors';

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
    // TODO: Implement beam analysis logic
    res.json({
      message: 'Analysis endpoint',
      received: { geometry, materials, loads, supports }
    });
  } catch (error) {
    res.status(400).json({ error: 'Analysis failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
