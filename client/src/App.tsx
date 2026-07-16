import React, { useState } from 'react';
import './App.css';
import BeamInputForm from './components/BeamInputForm';
import AnalysisResults from './components/AnalysisResults';

interface AnalysisData {
  geometry: any;
  materials: any;
  loads: any;
  supports: any;
  results?: any;
}

function App() {
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

  const handleAnalyze = async (data: AnalysisData) => {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const results = await response.json();
      setAnalysisData({ ...data, results });
    } catch (error) {
      console.error('Analysis failed:', error);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Working Beam - Structural Analysis Tool</h1>
      </header>
      <main className="App-main">
        <BeamInputForm onAnalyze={handleAnalyze} />
        {analysisData && <AnalysisResults data={analysisData} />}
      </main>
    </div>
  );
}

export default App;
