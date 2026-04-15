// pages/api/coverage.js
import { executeQuery } from '../../lib/snowflake';
import { getOSNCoverageQuery } from '../../lib/queries';
import cache from '../../lib/cache';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      states = [],
      osns = [],
      statuses = [],
      propertyTypes = [],
      forceRefresh = false,
    } = req.body;

    if (states.length === 0) {
      return res.status(400).json({ error: 'At least one state is required for coverage summary.' });
    }

    const cacheKey = cache.buildKey('coverage', {
      states: [...states].sort(),
      osns: [...osns].sort(),
      statuses: [...statuses].sort(),
      propertyTypes: [...propertyTypes].sort(),
    });

    if (!forceRefresh) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json({ success: true, data: cached, fromCache: true });
      }
    }
    res.setHeader('X-Cache', 'MISS');

    const sql = getOSNCoverageQuery({ states, osns, statuses, propertyTypes });
    const rows = await executeQuery(sql);

    const data = rows.map(row => {
      const normalized = {};
      Object.keys(row).forEach(key => { normalized[key.toLowerCase()] = row[key]; });
      return normalized;
    });

    await cache.set(cacheKey, data, cache.TTL.COVERAGE);
    return res.status(200).json({ success: true, data, fromCache: false });
  } catch (err) {
    console.error('Coverage API error:', err);
    return res.status(500).json({ error: 'Failed to fetch coverage data', detail: err.message });
  }
}
