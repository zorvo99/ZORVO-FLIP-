import React from 'react';
import { fs } from './fieldStyles';

interface Props {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

const ToggleField: React.FC<Props> = ({ label, value, onChange }) => (
  <button type="button" onClick={() => onChange(!value)} style={value ? fs.toggleOn : fs.toggleOff}>
    {label}: {value ? 'Yes' : 'No'}
  </button>
);

export default ToggleField;
