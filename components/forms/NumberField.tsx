import React from 'react';
import { numberInputQuickEntryProps } from './quickNumericInput';
import { fs } from './fieldStyles';

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  placeholder?: string;
}

const NumberField: React.FC<Props> = ({ label, value, onChange, unit, placeholder }) => (
  <div style={fs.box}>
    <label style={fs.label}>
      {label}
      {unit ? ` (${unit})` : ''}
    </label>
    <input
      type="number"
      step={0.01}
      placeholder={placeholder}
      value={Number.isFinite(value) ? value : ''}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={fs.input}
      {...numberInputQuickEntryProps}
    />
  </div>
);

export default NumberField;
