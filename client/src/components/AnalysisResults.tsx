import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AnalysisResultsProps {
  data: any;
}

const AnalysisResults: React.FC<AnalysisResultsProps> = ({ data }) => {
  const results = data.results;
  if (!results || results.error) {
    return (
      <div className="results-container">
        <h2>Analysis failed</h2>
        <p>{results?.error ?? 'No results returned.'}</p>
      </div>
    );
  }

  const status = (passed: boolean) => passed ? 'PASS' : 'FAIL';
  const statusClass = (passed: boolean) => passed ? 'pass' : 'fail';

  return (
    <div className="results-container">
      <h2>Analysis Results</h2>

      <div className="results-grid">
        <div className="result-card">
          <h3>Summary</h3>
          <div className="result-item"><span>Span:</span><strong>{data.geometry.span} m</strong></div>
          <div className="result-item"><span>Material:</span><strong>{data.materials.type}</strong></div>
          <div className="result-item"><span>Maximum shear:</span><strong>{results.maximumShear.toFixed(2)} kN</strong></div>
          <div className="result-item"><span>Maximum moment:</span><strong>{results.maximumMoment.toFixed(2)} kN-m</strong></div>
        </div>

        <div className="result-card">
          <h3>Reactions</h3>
          <div className="result-item"><span>Ra:</span><strong>{results.reactions.Ra.toFixed(2)} kN</strong></div>
          <div className="result-item"><span>Rb:</span><strong>{results.reactions.Rb.toFixed(2)} kN</strong></div>
          {results.reactions.Ma !== undefined && (
            <div className="result-item"><span>Ma:</span><strong>{results.reactions.Ma.toFixed(2)} kN-m</strong></div>
          )}
          {results.reactions.Mb !== undefined && (
            <div className="result-item"><span>Mb:</span><strong>{results.reactions.Mb.toFixed(2)} kN-m</strong></div>
          )}
        </div>

        <div className="result-card">
          <h3>Design Checks</h3>
          <div className="result-item"><span>Code:</span><strong>{results.design.code}</strong></div>
          <div className="result-item"><span>Flexural:</span><strong className={statusClass(results.checks.flexure)}>{status(results.checks.flexure)}</strong></div>
          <div className="result-item"><span>Shear:</span><strong className={statusClass(results.checks.shear)}>{status(results.checks.shear)}</strong></div>
          <div className="result-item"><span>Deflection:</span><strong className={statusClass(results.checks.deflection)}>{status(results.checks.deflection)}</strong></div>
          <div className="result-item"><span>Maximum deflection:</span><strong>{results.maximumDeflection.toFixed(2)} / {results.allowableDeflection.toFixed(2)} mm</strong></div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container">
          <h3>Shear Force Diagram</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={results.diagrams}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="position" label={{ value: 'Position (m)', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Shear (kN)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line type="linear" dataKey="shear" stroke="#8884d8" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Bending Moment Diagram</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={results.diagrams}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="position" label={{ value: 'Position (m)', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Moment (kN-m)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line type="linear" dataKey="moment" stroke="#82ca9d" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <style>{`
        .results-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.1); max-width: 900px; }
        .results-container h2 { margin-top: 0; color: #333; }
        .results-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(250px,1fr)); gap: 20px; margin-bottom: 30px; }
        .result-card, .chart-container { border: 1px solid #e0e0e0; padding: 15px; border-radius: 4px; background: #f9f9f9; }
        .result-card h3, .chart-container h3 { margin-top: 0; color: #667eea; }
        .result-item { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0; font-size: 14px; }
        .result-item span { color: #666; }
        .result-item strong { color: #333; text-align: right; }
        .pass { color: #4caf50 !important; }
        .fail { color: #d32f2f !important; }
        .charts-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(400px,1fr)); gap: 20px; margin-top: 30px; }
      `}</style>
    </div>
  );
};

export default AnalysisResults;
