import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AnalysisResultsProps {
  data: any;
}

const AnalysisResults: React.FC<AnalysisResultsProps> = ({ data }) => {
  // Mock data for demonstration
  const shearData = Array.from({ length: 11 }, (_, i) => ({
    position: i / 2,
    shear: 50 - i * 10,
  }));

  const momentData = Array.from({ length: 11 }, (_, i) => ({
    position: i / 2,
    moment: Math.sin(i / 5) * 100,
  }));

  return (
    <div className="results-container">
      <h2>Analysis Results</h2>

      <div className="results-grid">
        <div className="result-card">
          <h3>Summary</h3>
          <div className="result-item">
            <span>Span:</span>
            <strong>{data.geometry.span}m</strong>
          </div>
          <div className="result-item">
            <span>Material:</span>
            <strong>{data.materials.type}</strong>
          </div>
        </div>

        <div className="result-card">
          <h3>Reactions</h3>
          <div className="result-item">
            <span>Ra:</span>
            <strong>-- kN</strong>
          </div>
          <div className="result-item">
            <span>Rb:</span>
            <strong>-- kN</strong>
          </div>
        </div>

        <div className="result-card">
          <h3>Design Checks</h3>
          <div className="result-item">
            <span>Flexural:</span>
            <strong className="pass">✓ PASS</strong>
          </div>
          <div className="result-item">
            <span>Shear:</span>
            <strong className="pass">✓ PASS</strong>
          </div>
          <div className="result-item">
            <span>Deflection:</span>
            <strong className="pass">✓ PASS</strong>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container">
          <h3>Shear Force Diagram</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={shearData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="position" label={{ value: 'Position (m)', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Shear (kN)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line type="monotone" dataKey="shear" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Bending Moment Diagram</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={momentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="position" label={{ value: 'Position (m)', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Moment (kN-m)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line type="monotone" dataKey="moment" stroke="#82ca9d" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <style>{`
        .results-container {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          max-width: 900px;
        }

        .results-container h2 {
          margin-top: 0;
          color: #333;
        }

        .results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .result-card {
          border: 1px solid #e0e0e0;
          padding: 15px;
          border-radius: 4px;
          background: #f9f9f9;
        }

        .result-card h3 {
          margin-top: 0;
          color: #667eea;
        }

        .result-item {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          font-size: 14px;
        }

        .result-item span {
          color: #666;
        }

        .result-item strong {
          color: #333;
        }

        .pass {
          color: #4caf50 !important;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 20px;
          margin-top: 30px;
        }

        .chart-container {
          border: 1px solid #e0e0e0;
          padding: 15px;
          border-radius: 4px;
          background: #f9f9f9;
        }

        .chart-container h3 {
          margin-top: 0;
          color: #667eea;
        }
      `}</style>
    </div>
  );
};

export default AnalysisResults;
