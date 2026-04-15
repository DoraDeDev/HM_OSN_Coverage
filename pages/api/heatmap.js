// pages/api/heatmap.js
// Heatmap: H3 / grid bins, or sampled listing points (HeatmapLayer), with cache

import { executeQuery } from '../../lib/snowflake';
import {
  getTileAggregationQuery,
  getH3TileAggregationQuery,
  getListingPointsHeatmapQuery,
  ZOOM_PRECISION,
  h3ResolutionForZoom,
} from '../../lib/tiles';
import cache from '../../lib/cache';

const USE_H3 = process.env.HEATMAP_USE_H3 !== 'false';

function pointSampleParams() {
  const rowLimit = Math.min(
    500000,
    Math.max(1000, parseInt(process.env.HEATMAP_POINT_LIMIT || '300000', 10)),
  );
  const bernoulliPct = Math.min(
    100,
    Math.max(0.001, parseFloat(process.env.HEATMAP_POINT_BERNOULLI_PCT || '2')),
  );
  return { rowLimit, bernoulliPct };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    states = [],
    osns = [],
    statuses = [],
    propertyTypes = [],
    zoom = 5,
    forceRefresh = false,
    visualization = 'bins',
  } = req.body;

  if (states.length === 0) {
    return res.status(400).json({
      error: 'Select at least one state. OSN and other filters apply within the selected states.',
    });
  }

  const zFloat = Math.min(22, Math.max(0, Number(zoom) || 5));
  const z = Math.min(15, Math.max(0, Math.floor(zFloat)));
  const precision = ZOOM_PRECISION[z] || 2;
  const h3Res = h3ResolutionForZoom(zFloat);
  const usePoints = visualization === 'points';

  const { rowLimit, bernoulliPct } = pointSampleParams();
  const requestedResolutionKey = usePoints
    ? `points:${rowLimit}:${bernoulliPct}`
    : (USE_H3 ? `h3:${h3Res}` : `grid:${precision}`);

  const cacheKey = cache.buildKey('tiles', {
    states: [...states].sort(),
    osns: [...osns].sort(),
    statuses: [...statuses].sort(),
    propertyTypes: [...propertyTypes].sort(),
    resolution: requestedResolutionKey,
    visualization: usePoints ? 'points' : 'bins',
  });

  if (!forceRefresh) {
    const cached = await cache.get(cacheKey);
    if (cached && typeof cached === 'object' && Array.isArray(cached.data)) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', cacheKey);
      return res.status(200).json({
        success: true,
        count: cached.data.length,
        data: cached.data,
        fromCache: true,
        aggregation: cached.aggregation,
        precision: cached.precision,
        h3Resolution: cached.h3Resolution,
        resolutionKey: cached.resolutionKey,
        requestedResolutionKey: cached.requestedResolutionKey ?? requestedResolutionKey,
        h3Fallback: cached.h3Fallback ?? false,
        pointSampleLimit: cached.pointSampleLimit ?? null,
        pointBernoulliPct: cached.pointBernoulliPct ?? null,
      });
    }
  }

  res.setHeader('X-Cache', 'MISS');

  if (usePoints) {
    try {
      const sql = getListingPointsHeatmapQuery({
        states,
        osns,
        statuses,
        propertyTypes,
        bernoulliPct,
        rowLimit,
      });
      const rows = await executeQuery(sql);
      const data = rows.map(row => {
        const out = {};
        Object.keys(row).forEach(k => { out[k.toLowerCase()] = row[k]; });
        return out;
      });

      const resolutionKey = requestedResolutionKey;
      const ttl = data.length > 200000 ? cache.TTL.TILES : cache.TTL.HEATMAP;
      const payload = {
        data,
        aggregation: 'points',
        precision: null,
        h3Resolution: null,
        resolutionKey,
        requestedResolutionKey,
        h3Fallback: false,
        pointSampleLimit: rowLimit,
        pointBernoulliPct: bernoulliPct,
      };
      await cache.set(cacheKey, payload, ttl);

      return res.status(200).json({
        success: true,
        count: data.length,
        data,
        fromCache: false,
        aggregation: 'points',
        precision: null,
        h3Resolution: null,
        resolutionKey,
        requestedResolutionKey,
        h3Fallback: false,
        pointSampleLimit: rowLimit,
        pointBernoulliPct: bernoulliPct,
        ttl,
      });
    } catch (err) {
      console.error('[heatmap] points sample error:', err);
      return res.status(500).json({ error: 'Failed to fetch heatmap data', detail: err.message });
    }
  }

  let aggregation = USE_H3 ? 'h3' : 'grid';
  let h3Fallback = false;
  let rows;
  let effectivePrecision = precision;

  try {
    if (USE_H3) {
      try {
        const sql = getH3TileAggregationQuery({
          states, osns, statuses, propertyTypes, h3Res,
        });
        rows = await executeQuery(sql);
      } catch (h3Err) {
        console.warn('[heatmap] H3 query failed, using lat/lon grid:', h3Err?.message || h3Err);
        h3Fallback = true;
        aggregation = 'grid';
        const sql = getTileAggregationQuery({
          states, osns, statuses, propertyTypes, precision,
        });
        rows = await executeQuery(sql);
      }
    } else {
      const sql = getTileAggregationQuery({
        states, osns, statuses, propertyTypes, precision,
      });
      rows = await executeQuery(sql);
    }

    const data = rows.map(row => {
      const out = {};
      Object.keys(row).forEach(k => { out[k.toLowerCase()] = row[k]; });
      return out;
    });

    const resolutionKey = aggregation === 'h3'
      ? `h3:${h3Res}`
      : `grid:${effectivePrecision}`;

    const ttl = data.length > 50000
      ? cache.TTL.TILES
      : data.length > 10000
        ? cache.TTL.COVERAGE
        : cache.TTL.HEATMAP;

    const payload = {
      data,
      aggregation,
      precision: effectivePrecision,
      h3Resolution: aggregation === 'h3' ? h3Res : null,
      resolutionKey,
      requestedResolutionKey,
      h3Fallback,
      pointSampleLimit: null,
      pointBernoulliPct: null,
    };

    await cache.set(cacheKey, payload, ttl);

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
      fromCache: false,
      aggregation,
      precision: effectivePrecision,
      h3Resolution: aggregation === 'h3' ? h3Res : null,
      resolutionKey,
      requestedResolutionKey,
      h3Fallback,
      pointSampleLimit: null,
      pointBernoulliPct: null,
      ttl,
    });
  } catch (err) {
    console.error('[heatmap] Snowflake error:', err);
    return res.status(500).json({ error: 'Failed to fetch heatmap data', detail: err.message });
  }
}
