// pages/api/tiles.js
// Viewport-bounded tile API: only queries the visible map area
// Called on map pan/zoom to progressively load data

import { executeQuery } from '../../lib/snowflake';
import { getViewportTileQuery, ZOOM_PRECISION } from '../../lib/tiles';
import cache from '../../lib/cache';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    states = [],
    osns = [],
    statuses = [],
    propertyTypes = [],
    zoom = 8,
    bounds,           // { north, south, east, west }
    forceRefresh = false,
  } = req.body;

  if (!bounds) {
    return res.status(400).json({ error: 'bounds required (north, south, east, west)' });
  }

  // Clamp bounds to valid ranges
  const safeBounds = {
    north: Math.min(90,  parseFloat(bounds.north)),
    south: Math.max(-90, parseFloat(bounds.south)),
    east:  Math.min(180, parseFloat(bounds.east)),
    west:  Math.max(-180,parseFloat(bounds.west)),
  };

  const precision = ZOOM_PRECISION[Math.min(Math.floor(zoom), 15)] || 2;

  // Round bounds to grid precision to improve cache hit rate
  // (slightly different viewport shouldn't miss cache)
  const cellSizes = { 1: 1.0, 2: 0.5, 3: 0.2, 4: 0.1, 5: 0.05 };
  const cs = cellSizes[precision];
  const roundedBounds = {
    north: Math.ceil(safeBounds.north   / cs) * cs,
    south: Math.floor(safeBounds.south  / cs) * cs,
    east:  Math.ceil(safeBounds.east    / cs) * cs,
    west:  Math.floor(safeBounds.west   / cs) * cs,
  };

  const cacheKey = cache.buildKey('viewport', {
    states: [...states].sort(),
    osns: [...osns].sort(),
    statuses: [...statuses].sort(),
    propertyTypes: [...propertyTypes].sort(),
    precision,
    bounds: roundedBounds,
  });

  if (!forceRefresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json({ success: true, count: cached.length, data: cached, fromCache: true, precision });
    }
  }

  res.setHeader('X-Cache', 'MISS');

  try {
    const sql = getViewportTileQuery({
      states, osns, statuses, propertyTypes,
      precision,
      bounds: roundedBounds,
    });

    const rows = await executeQuery(sql);
    const data = rows.map(row => {
      const out = {};
      Object.keys(row).forEach(k => { out[k.toLowerCase()] = row[k]; });
      return out;
    });

    // Viewport tiles: shorter TTL since they're zoom/pan specific
    const ttl = cache.TTL.HEATMAP; // 2h
    await cache.set(cacheKey, data, ttl);

    return res.status(200).json({ success: true, count: data.length, data, fromCache: false, precision });
  } catch (err) {
    console.error('[tiles] Snowflake error:', err);
    return res.status(500).json({ error: 'Failed to fetch tiles', detail: err.message });
  }
}
