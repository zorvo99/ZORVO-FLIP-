import React, { useEffect, useState } from 'react';
import { getRoomScopeSections, type ScopeField } from '../config/roomScopes';
import { sectionCompletionPercent } from '../utils/scopeFieldCompletion';
import ToggleField from './forms/ToggleField';
import SelectField from './forms/SelectField';
import NumberField from './forms/NumberField';
import TextField from './forms/TextField';
import DimensionsField from './forms/DimensionsField';
import { fs } from './forms/fieldStyles';

interface Props {
  roomType: string;
  values: Record<string, string | number | boolean>;
  onPatch: (patch: Record<string, string | number | boolean>) => void;
  /** When true, each registry section is a collapsible panel with a completion % (default: true). */
  collapsible?: boolean;
}

function getStr(values: Record<string, string | number | boolean>, key: string): string {
  const v = values[key];
  if (v === undefined || v === null) return '';
  return String(v);
}

function getNum(values: Record<string, string | number | boolean>, key: string): number {
  const v = values[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') return parseFloat(v) || 0;
  return 0;
}

function getBool(values: Record<string, string | number | boolean>, key: string): boolean {
  return Boolean(values[key]);
}

const RoomScopeForm: React.FC<Props> = ({ roomType, values, onPatch, collapsible = true }) => {
  const sections = getRoomScopeSections(roomType);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setExpanded({});
  }, [roomType]);

  const isOpen = (title: string, index: number) => {
    if (Object.prototype.hasOwnProperty.call(expanded, title)) return expanded[title];
    return index < 1;
  };

  const toggleSection = (title: string, index: number) => {
    const next = !isOpen(title, index);
    setExpanded(e => ({ ...e, [title]: next }));
  };

  const renderField = (field: ScopeField) => {
    const key = field.key;
    if (key === 'windowQuantity' || key === 'doorQuantity') {
      const v = getNum(values, key);
      return (
        <div key={key} style={fs.box}>
          <label style={fs.label}>{field.label}</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPatch({ [key]: Math.max(0, v - 1) })}
              className="min-h-[44px] min-w-[44px] rounded-xl border border-[#1f2e1f] bg-[#111810] text-slate-200 font-black text-lg"
            >
              -
            </button>
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(v) ? v : 0}
              onChange={e => onPatch({ [key]: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
              style={fs.input}
              className="text-center"
            />
            <button
              type="button"
              onClick={() => onPatch({ [key]: v + 1 })}
              className="min-h-[44px] min-w-[44px] rounded-xl border border-[#3ddb6f] bg-[#3ddb6f] text-black font-black text-lg"
            >
              +
            </button>
          </div>
        </div>
      );
    }
    switch (field.type) {
      case 'toggle':
        return (
          <ToggleField key={key} label={field.label} value={getBool(values, key)} onChange={v => onPatch({ [key]: v })} />
        );
      case 'select':
        return (
          <SelectField
            key={key}
            label={field.label}
            value={getStr(values, key)}
            options={field.options || []}
            onChange={v => onPatch({ [key]: v })}
          />
        );
      case 'number':
      case 'quantity':
        return (
          <NumberField
            key={key}
            label={field.label}
            value={getNum(values, key)}
            onChange={v => onPatch({ [key]: v })}
            unit={field.unit}
            placeholder={field.placeholder}
          />
        );
      case 'text':
        return (
          <TextField key={key} label={field.label} value={getStr(values, key)} onChange={v => onPatch({ [key]: v })} placeholder={field.placeholder} />
        );
      case 'dimensions':
        return (
          <DimensionsField
            key={key}
            baseKey={key}
            label={field.label}
            values={values}
            onChange={patch => onPatch(patch as Record<string, string | number | boolean>)}
            unit={field.unit || 'm'}
          />
        );
      default:
        return null;
    }
  };

  if (!collapsible) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {sections.map(section => (
          <div key={section.title}>
            <h3 style={fs.sectionTitle}>{section.title}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{section.fields.map(renderField)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sections.map((section, sectionIndex) => {
        const pct = sectionCompletionPercent(section, values);
        const showFields = isOpen(section.title, sectionIndex);
        return (
          <div
            key={section.title}
            style={{
              borderRadius: 16,
              border: '1px solid #1f2e1f',
              background: '#0f150f',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => toggleSection(section.title, sectionIndex)}
              className="w-full text-left"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                minHeight: 48,
                padding: '14px 16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#e2e8f0',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h3
                  style={{
                    ...fs.sectionTitle,
                    margin: 0,
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {section.title}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: pct >= 80 ? '#3ddb6f' : pct >= 30 ? '#94a3b8' : '#fbbf24',
                  }}
                >
                  {pct}%
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: '#64748b',
                    transform: showFields ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                >
                  ▼
                </span>
              </div>
            </button>
            {showFields && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: '4px 14px 16px 14px',
                }}
              >
                {section.title === 'Windows' && (
                  <>
                    <p className="text-[9px] text-slate-500">Add window size and quantity for accurate costing</p>
                    {getNum(values, 'windowQuantity') <= 0 ? (
                      <p className="text-[9px] text-slate-500/80">No windows added yet</p>
                    ) : (
                      <p className="text-[9px] text-slate-300">
                        {Math.round(getNum(values, 'windowQuantity'))} × {getStr(values, 'windowSize') || 'Unspecified'} windows
                      </p>
                    )}
                  </>
                )}
                {section.title === 'Doors' && (
                  <>
                    <p className="text-[9px] text-slate-500">Add door type, material, and location for accurate costing</p>
                    {getNum(values, 'doorQuantity') <= 0 ? (
                      <p className="text-[9px] text-slate-500/80">No doors added yet</p>
                    ) : (
                      <p className="text-[9px] text-slate-300">
                        {Math.round(getNum(values, 'doorQuantity'))} × {getStr(values, 'doorType') || 'Unspecified'} {(getStr(values, 'doorMaterial') || '').toLowerCase()} {(getStr(values, 'doorLocation') || '').toLowerCase()} doors
                      </p>
                    )}
                  </>
                )}
                {section.fields.map(renderField)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RoomScopeForm;
