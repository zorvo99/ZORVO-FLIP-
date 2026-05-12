import React, { useEffect, useMemo, useState } from 'react';
import { selectAllOnNumberFocus } from './quickNumericInput';
import { fs } from './fieldStyles';

/** Three numeric fields; persisted as `${baseKey}_length|_width|_height` */
interface Props {
  baseKey: string;
  label: string;
  values: Record<string, string | number | boolean>;
  onChange: (patch: Record<string, number>) => void;
  unit?: string;
}

const DimensionsField: React.FC<Props> = ({ baseKey, label, values, onChange, unit = 'm' }) => {
  const lk = `${baseKey}_length`;
  const wk = `${baseKey}_width`;
  const hk = `${baseKey}_height`;
  const keys = useMemo(() => [lk, wk, hk], [lk, wk, hk]);
  const gv = (k: string) => {
    const v = values[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') return parseFloat(v) || 0;
    return 0;
  };
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  useEffect(() => {
    setDraft(prev => {
      const next = { ...prev };
      for (const k of keys) {
        if (focusedKey === k) continue;
        next[k] = String(gv(k));
      }
      return next;
    });
  }, [values, keys, focusedKey]);

  const parseNumeric = (raw: string): number => {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, n);
  };

  return (
    <div style={fs.box}>
      <label style={fs.label}>
        {label} ({unit})
      </label>
      <div style={fs.dimGrid}>
        {[
          { k: lk, sub: 'Length' },
          { k: wk, sub: 'Width' },
          { k: hk, sub: 'Height' },
        ].map(({ k, sub }) => (
          <div key={k}>
            <span style={{ ...fs.label, marginBottom: 4 }}>{sub}</span>
            <input
              type="number"
              step={0.01}
              value={draft[k] ?? String(gv(k))}
              onChange={e => {
                const raw = e.target.value;
                setDraft(prev => ({ ...prev, [k]: raw }));
                onChange({ [k]: parseNumeric(raw) });
              }}
              onFocus={e => {
                setFocusedKey(k);
                selectAllOnNumberFocus(e);
              }}
              onBlur={() => setFocusedKey(null)}
              style={fs.input}
              inputMode="decimal"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DimensionsField;
