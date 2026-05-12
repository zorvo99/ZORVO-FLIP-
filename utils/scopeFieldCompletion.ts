import type { ScopeField, ScopeSection } from '../config/roomScopes';
import { getRoomScopeSections } from '../config/roomScopes';

function gv(values: Record<string, string | number | boolean>, k: string): number {
  const v = values[k];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') return parseFloat(v) || 0;
  return 0;
}

/**
 * "Filled" matches the walkthrough completion heuristic: toggles only count when true, etc.
 */
export function isScopeFieldFilled(
  field: ScopeField,
  values: Record<string, string | number | boolean>
): boolean {
  const key = field.key;
  switch (field.type) {
    case 'toggle':
      return values[key] === true;
    case 'select':
      return typeof values[key] === 'string' && values[key].trim().length > 0;
    case 'number':
    case 'quantity': {
      const v = values[key];
      if (typeof v === 'number' && Number.isFinite(v)) return v > 0;
      if (typeof v === 'string' && v.trim() !== '') return parseFloat(v) > 0;
      return false;
    }
    case 'text':
      return typeof values[key] === 'string' && values[key].trim().length > 0;
    case 'dimensions': {
      const lk = `${key}_length`;
      const wk = `${key}_width`;
      const hk = `${key}_height`;
      return gv(values, lk) > 0 && gv(values, wk) > 0 && gv(values, hk) > 0;
    }
    default:
      return false;
  }
}

export function sectionCompletionPercent(
  section: ScopeSection,
  values: Record<string, string | number | boolean>
): number {
  if (section.title === 'Windows') {
    const size = typeof values.windowSize === 'string' && values.windowSize.trim().length > 0;
    const qty = gv(values, 'windowQuantity') > 0;
    return size && qty ? 100 : 0;
  }
  if (section.title === 'Doors') {
    const qty = gv(values, 'doorQuantity') > 0;
    const type = typeof values.doorType === 'string' && values.doorType.trim().length > 0;
    const material = typeof values.doorMaterial === 'string' && values.doorMaterial.trim().length > 0;
    const location = typeof values.doorLocation === 'string' && values.doorLocation.trim().length > 0;
    return qty && type && material && location ? 100 : 0;
  }
  if (section.fields.length === 0) return 100;
  const filled = section.fields.filter(f => isScopeFieldFilled(f, values)).length;
  return Math.round((filled / section.fields.length) * 100);
}

export function registryScopeFieldCounts(
  roomType: string,
  values: Record<string, string | number | boolean>
): { filled: number; total: number; percent: number } {
  const sections = getRoomScopeSections(roomType);
  let total = 0;
  let filled = 0;
  for (const s of sections) {
    for (const f of s.fields) {
      total += 1;
      if (isScopeFieldFilled(f, values)) filled += 1;
    }
  }
  return {
    filled,
    total,
    percent: total ? Math.round((filled / total) * 100) : 100,
  };
}
