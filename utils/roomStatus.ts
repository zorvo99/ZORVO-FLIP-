import type { Room } from '../types';
import { registryScopeFieldCounts } from './scopeFieldCompletion';

export function isRoomMissingDimensions(room: Room): boolean {
  const { length, width, height } = room.dimensions;
  return !(length > 0 && width > 0 && height > 0);
}

/**
 * Walk-through room completion (same weighting as the previous in-component helper).
 */
export function getRoomCompletionPercent(room: Room): number {
  const hasDimensions = [room.dimensions.length, room.dimensions.width, room.dimensions.height].every(v => v > 0);
  const hasPhoto = (room.photoUrls?.length || 0) > 0;
  const hasNotes = (room.notes?.trim().length || 0) >= 10;
  const mergedScope = { ...(room.scopeInputs || {}), ...(room.scope || {}) };
  const scopeValues = Object.values(mergedScope);
  const scopeFilled = scopeValues.filter(
    v => v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.trim().length > 0)
  ).length;
  const scopeRatio = scopeValues.length ? scopeFilled / scopeValues.length : 0;
  const intendedRatio = Math.min((room.intendedScope?.length || 0) / 3, 1);

  const score =
    (hasDimensions ? 20 : 0) +
    (hasPhoto ? 20 : 0) +
    (hasNotes ? 15 : 0) +
    (scopeRatio * 30) +
    (intendedRatio * 15);
  return Math.round(Math.min(score, 100));
}

/** "Completed" for project status: measurable shell + nontrivial capture score. */
export function isRoomWalkthroughComplete(room: Room): boolean {
  if (isRoomMissingDimensions(room)) return false;
  return getRoomCompletionPercent(room) >= 55;
}

export function roomNeedsScopeAttention(room: Room): boolean {
  if (isRoomMissingDimensions(room)) return false;
  const values = { ...(room.scopeInputs || {}), ...(room.scope || {}) };
  const { percent, total } = registryScopeFieldCounts(room.type, values);
  if (total === 0) return false;
  return percent < 20;
}

export function getScopeCompletionForRoom(room: Room) {
  const values = { ...(room.scopeInputs || {}), ...(room.scope || {}) };
  return registryScopeFieldCounts(room.type, values);
}
