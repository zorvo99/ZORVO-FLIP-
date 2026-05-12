import React from 'react';
import { fs } from './fieldStyles';

interface Props {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}

const SelectField: React.FC<Props> = ({ label, value, options, onChange, placeholder = 'Select' }) => (
  <div style={fs.box}>
    <label style={fs.label}>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={fs.select}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </div>
);

export default SelectField;
