// Approximate US state bounding boxes (from public domain state polygons).
// Keys match common STATEORPROVINCE values: full names and 2-letter codes.

import rawBounds from './us-state-bounds.json';

const BOUNDS = { ...rawBounds };
if (BOUNDS['Puerto Rico'] && !BOUNDS.PR) BOUNDS.PR = BOUNDS['Puerto Rico'];

function pointInBox(lon, lat, b) {
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

/**
 * Keep heatmap points that fall inside the geographic footprint of the listing's state,
 * or inside any selected state if the label is missing from the lookup.
 */
export function lonLatMatchesStateSelection(lon, lat, selectedStates, rowState) {
  if (!selectedStates?.length) return true;

  const tryStates = [];
  if (rowState && String(rowState).trim()) {
    tryStates.push(String(rowState).trim());
  }
  for (const s of selectedStates) {
    if (!tryStates.includes(s)) tryStates.push(s);
  }

  let hadBounds = false;
  for (const s of tryStates) {
    const b = BOUNDS[s];
    if (!b) continue;
    hadBounds = true;
    if (pointInBox(lon, lat, b)) return true;
  }
  if (!hadBounds) return true;
  return false;
}

/** Union bbox for map fitting when one or more states are selected. */
export function unionBoundsForStates(stateLabels) {
  if (!stateLabels?.length) return null;
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  let any = false;
  for (const s of stateLabels) {
    const b = BOUNDS[s];
    if (!b) continue;
    any = true;
    minLon = Math.min(minLon, b.minLon);
    maxLon = Math.max(maxLon, b.maxLon);
    minLat = Math.min(minLat, b.minLat);
    maxLat = Math.max(maxLat, b.maxLat);
  }
  if (!any) return null;
  return { minLon, maxLon, minLat, maxLat };
}

export { BOUNDS };
