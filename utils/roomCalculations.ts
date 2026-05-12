import type { Dimensions, RoomCalculations } from '../types';

/**
 * Shell geometry helpers expect dimensions in metres. Load paths use `sanitizeDimensions`
 * which may divide values greater than 50 by 1000 (mm mistaken for m) and set `dimensions._autoConverted`.
 */

/** Floor area m² */
export function computeFloorArea(d: Dimensions): number {
  const l = Math.max(0, d.length || 0);
  const w = Math.max(0, d.width || 0);
  return Math.round(l * w * 100) / 100;
}

/** Four-wall surface area (excludes openings) — indicative m² */
export function computeWallArea(d: Dimensions): number {
  const l = Math.max(0, d.length || 0);
  const w = Math.max(0, d.width || 0);
  const h = Math.max(0, d.height || 0);
  const area = 2 * (l + w) * h;
  return Math.round(area * 100) / 100;
}

export function computeFloorPerimeter(d: Dimensions): number {
  const l = Math.max(0, d.length || 0);
  const w = Math.max(0, d.width || 0);
  return Math.round(2 * (l + w) * 100) / 100;
}

export function computeRoomCalculations(dimensions: Dimensions): RoomCalculations {
  return {
    floorArea: computeFloorArea(dimensions),
    wallArea: computeWallArea(dimensions),
    linearMetres: computeFloorPerimeter(dimensions),
  };
}
