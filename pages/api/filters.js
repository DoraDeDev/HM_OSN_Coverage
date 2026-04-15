// pages/api/filters.js
import { executeQuery } from '../../lib/snowflake';
import { GET_STATES, getOSNQuery, GET_STATUSES, GET_PROPERTY_TYPES } from '../../lib/queries';
import cache from '../../lib/cache';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const raw = req.method === 'POST' ? req.body : req.query;
    const { type, states, forceRefresh } = raw;
    const statesArr = states ? (Array.isArray(states) ? states : [states]) : [];
    const statusesArr = raw.statuses
      ? (Array.isArray(raw.statuses) ? raw.statuses : [raw.statuses])
      : [];
    const propertyTypesArr = raw.propertyTypes
      ? (Array.isArray(raw.propertyTypes) ? raw.propertyTypes : [raw.propertyTypes])
      : [];

    const cacheParams = type === 'osns'
      ? {
          states: [...statesArr].sort(),
          statuses: [...statusesArr].sort(),
          propertyTypes: [...propertyTypesArr].sort(),
        }
      : { states: [...statesArr].sort() };

    const cacheKey = cache.buildKey(`filters:${type}`, cacheParams);
    if (!forceRefresh) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        if (type === 'all') return res.status(200).json({ success: true, ...cached });
        return res.status(200).json({ success: true, data: cached });
      }
    }
    res.setHeader('X-Cache', 'MISS');

    let result = [];

    switch (type) {
      case 'states': {
        const rows = await executeQuery(GET_STATES);
        result = rows.map(r => {
          const k = Object.keys(r).find(k => k.toLowerCase() === 'stateorprovince');
          return r[k];
        }).filter(Boolean).sort();
        break;
      }
      case 'osns': {
        const sql = getOSNQuery({
          states: statesArr,
          statuses: statusesArr,
          propertyTypes: propertyTypesArr,
        });
        const rows = await executeQuery(sql);
        result = rows.map(r => {
          const k = Object.keys(r).find(k => k.toLowerCase() === 'originatingsystemname');
          return r[k];
        }).filter(Boolean).sort();
        break;
      }
      case 'statuses': {
        const rows = await executeQuery(GET_STATUSES);
        result = rows.map(r => {
          const k = Object.keys(r).find(k => k.toLowerCase() === 'standardstatus');
          return r[k];
        }).filter(Boolean).sort();
        break;
      }
      case 'propertyTypes': {
        const rows = await executeQuery(GET_PROPERTY_TYPES);
        result = rows.map(r => {
          const k = Object.keys(r).find(k => k.toLowerCase() === 'propertytype');
          return r[k];
        }).filter(Boolean).sort();
        break;
      }
      case 'all': {
        const [stateRows, statusRows, propRows] = await Promise.all([
          executeQuery(GET_STATES),
          executeQuery(GET_STATUSES),
          executeQuery(GET_PROPERTY_TYPES),
        ]);
        const payload = {
          states: stateRows.map(r => {
            const k = Object.keys(r).find(k => k.toLowerCase() === 'stateorprovince');
            return r[k];
          }).filter(Boolean).sort(),
          statuses: statusRows.map(r => {
            const k = Object.keys(r).find(k => k.toLowerCase() === 'standardstatus');
            return r[k];
          }).filter(Boolean).sort(),
          propertyTypes: propRows.map(r => {
            const k = Object.keys(r).find(k => k.toLowerCase() === 'propertytype');
            return r[k];
          }).filter(Boolean).sort(),
        };
        await cache.set(cacheKey, payload, cache.TTL.FILTERS);
        return res.status(200).json({ success: true, ...payload });
      }
      default:
        return res.status(400).json({ error: 'Invalid filter type' });
    }

    await cache.set(cacheKey, result, cache.TTL.FILTERS);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('Filters API error:', err);
    return res.status(500).json({
      error: 'Failed to fetch filter options',
      detail: err.message,
    });
  }
}
