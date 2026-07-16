import React, { useState } from 'react';
import { useForm } from 'react-hook-form';

interface BeamInputFormProps {
  onAnalyze: (data: any) => void;
}

const BeamInputForm: React.FC<BeamInputFormProps> = ({ onAnalyze }) => {
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      geometry: { span: 5, width: 300, depth: 500 },
      material: 'concrete',
      fc: 30,
      fy: 400,
      loads: [{ type: 'dead', value: 20 }],
      support: 'simple',
    },
  });

  const onSubmit = (data: any) => {
    onAnalyze({
      geometry: data.geometry,
      materials: {
        type: data.material,
        fc: data.fc,
        fy: data.fy,
      },
      loads: data.loads,
      supports: [
        { position: 'left', type: 'pin' },
        { position: 'right', type: 'roller' },
      ],
    });
  };

  const materialType = watch('material');

  return (
    <div className="input-form-container">
      <form onSubmit={handleSubmit(onSubmit)} className="input-form">
        <h2>Beam Input</h2>

        <fieldset>
          <legend>Geometry (span in m, section in mm)</legend>
          <div className="form-group">
            <label>Span (L):</label>
            <input type="number" {...register('geometry.span', { valueAsNumber: true })} step="0.1" />
          </div>
          <div className="form-group">
            <label>Width (b):</label>
            <input type="number" {...register('geometry.width', { valueAsNumber: true })} />
          </div>
          <div className="form-group">
            <label>Depth (d):</label>
            <input type="number" {...register('geometry.depth', { valueAsNumber: true })} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Material</legend>
          <div className="form-group">
            <label>Type:</label>
            <select {...register('material')}>
              <option value="concrete">Concrete (ACI 318)</option>
              <option value="steel">Steel (AISC)</option>
            </select>
          </div>

          {materialType === 'concrete' && (
            <div className="form-group">
              <label>fc (MPa):</label>
              <input type="number" {...register('fc', { valueAsNumber: true })} step="0.1" />
            </div>
          )}

          {materialType === 'steel' && (
            <div className="form-group">
              <label>Fy (MPa):</label>
              <input type="number" {...register('fy', { valueAsNumber: true })} step="0.1" />
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Loads (kN/m)</legend>
          <div className="form-group">
            <label>Dead Load:</label>
            <input type="number" {...register('loads.0.value', { valueAsNumber: true })} step="0.1" />
          </div>
        </fieldset>

        <button type="submit" className="submit-btn">
          Analyze
        </button>
      </form>

      <style>{`
        .input-form-container {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          max-width: 400px;
        }

        .input-form h2 {
          margin-top: 0;
          color: #333;
        }

        fieldset {
          border: 1px solid #ddd;
          padding: 15px;
          margin: 15px 0;
          border-radius: 4px;
        }

        legend {
          padding: 0 10px;
          font-weight: bold;
          color: #667eea;
        }

        .form-group {
          margin: 10px 0;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        label {
          flex: 0 0 120px;
          font-weight: 500;
          color: #555;
        }

        input,
        select {
          flex: 1;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .submit-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          margin-top: 15px;
        }

        .submit-btn:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
};

export default BeamInputForm;
