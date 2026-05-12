import React from 'react';
import { fs } from './fieldStyles';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const TextField: React.FC<Props> = ({ label, value, onChange, placeholder }) => (
  <div style={fs.box}>
    <label style={fs.label}>{label}</label>
    <input type="text" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={fs.input} />
  </div>
);

export default TextField;
