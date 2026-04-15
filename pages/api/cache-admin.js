// pages/api/cache-admin.js
// Admin endpoints: view cache stats, invalidate, force-refresh specific keys

import cache from '../../lib/cache';

export default async function handler(req, res) {
  // Simple admin guard — add your own auth here for production
  const adminToken = req.headers['x-admin-token'];
  if (process.env.CACHE_ADMIN_TOKEN && adminToken !== process.env.CACHE_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action } = req.query;

  try {
    switch (action) {
      // GET /api/cache-admin?action=stats
      case 'stats': {
        const stats = await cache.stats();
        return res.status(200).json({ success: true, stats });
      }

      // POST /api/cache-admin?action=invalidate-all
      case 'invalidate-all': {
        if (req.method !== 'POST') return res.status(405).end();
        await cache.invalidateAll();
        return res.status(200).json({ success: true, message: 'All MLS cache invalidated' });
      }

      // POST /api/cache-admin?action=invalidate-state  body: { state: "FL" }
      case 'invalidate-state': {
        if (req.method !== 'POST') return res.status(405).end();
        const { state } = req.body || {};
        if (!state) return res.status(400).json({ error: 'state required' });
        await cache.invalidateState(state);
        return res.status(200).json({ success: true, message: `Cache invalidated for ${state}` });
      }

      // POST /api/cache-admin?action=invalidate-filters
      case 'invalidate-filters': {
        if (req.method !== 'POST') return res.status(405).end();
        await cache.delPattern('mls:filters:*');
        return res.status(200).json({ success: true, message: 'Filter cache invalidated' });
      }

      default:
        return res.status(400).json({
          error: 'Unknown action',
          validActions: ['stats', 'invalidate-all', 'invalidate-state', 'invalidate-filters'],
        });
    }
  } catch (err) {
    console.error('[cache-admin] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
