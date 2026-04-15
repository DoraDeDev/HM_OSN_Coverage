// lib/cache.js
// Multi-layer cache: Redis (primary) → in-memory LRU (fallback)
// Handles billions of SF records by caching aggregated results

const crypto = require('crypto');

// ─── TTL constants (seconds) ───────────────────────────────────────────────
const TTL = {
  TILES: 60 * 60 * 6,        // 6h  — hex-tile aggregations
  FILTERS: 60 * 60 * 24,     // 24h — dropdown options (states, OSNs, etc.)
  COVERAGE: 60 * 60 * 4,     // 4h  — OSN coverage summaries
  HEATMAP: 60 * 60 * 2,      // 2h  — raw heatmap queries (smaller filtered sets)
  AGENT: 60 * 10,            // 10m — AI agent responses
};

// ─── In-memory LRU (fallback when Redis unavailable) ───────────────────────
const MAX_MEMORY_ENTRIES = 200;
const memoryCache = new Map();
const memoryCacheTimestamps = new Map();

function memGet(key) {
  const ts = memoryCacheTimestamps.get(key);
  if (!ts) return null;
  if (Date.now() > ts.expiresAt) {
    memoryCache.delete(key);
    memoryCacheTimestamps.delete(key);
    return null;
  }
  return memoryCache.get(key);
}

function memSet(key, value, ttlSeconds) {
  // Evict oldest if at capacity
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldest = [...memoryCacheTimestamps.entries()]
      .sort((a, b) => a[1].setAt - b[1].setAt)[0];
    if (oldest) {
      memoryCache.delete(oldest[0]);
      memoryCacheTimestamps.delete(oldest[0]);
    }
  }
  memoryCache.set(key, value);
  memoryCacheTimestamps.set(key, {
    setAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function memDel(key) {
  memoryCache.delete(key);
  memoryCacheTimestamps.delete(key);
}

function memDelPattern(pattern) {
  const regex = new RegExp(pattern.replace(/\*/g, '.*'));
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
      memoryCacheTimestamps.delete(key);
    }
  }
}

// ─── Redis client (lazy init) ───────────────────────────────────────────────
let redisClient = null;
let redisAvailable = false;
let redisInitAttempted = false;

async function getRedis() {
  if (redisInitAttempted) return redisAvailable ? redisClient : null;
  redisInitAttempted = true;

  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';

  try {
    // Try ioredis first, fall back gracefully
    const Redis = require('ioredis');
    const client = new Redis(redisUrl, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // don't retry — fall back to memory
      lazyConnect: true,
    });

    await client.connect();
    await client.ping();
    redisClient = client;
    redisAvailable = true;
    console.log('[cache] Redis connected:', redisUrl.replace(/:[^:@]+@/, ':***@'));

    client.on('error', (err) => {
      console.warn('[cache] Redis error, falling back to memory:', err.message);
      redisAvailable = false;
    });

    client.on('reconnecting', () => {
      redisAvailable = true;
    });
  } catch (err) {
    console.warn('[cache] Redis unavailable, using in-memory cache:', err.message);
    redisAvailable = false;
  }

  return redisAvailable ? redisClient : null;
}

// ─── Cache key builder ──────────────────────────────────────────────────────
function buildKey(namespace, params) {
  const normalized = JSON.stringify(params, Object.keys(params || {}).sort());
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `mls:${namespace}:${hash}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────
const cache = {
  TTL,
  buildKey,

  async get(key) {
    // Try Redis first
    const redis = await getRedis();
    if (redis && redisAvailable) {
      try {
        const val = await redis.get(key);
        if (val !== null) {
          return JSON.parse(val);
        }
      } catch (err) {
        console.warn('[cache] Redis get error:', err.message);
      }
    }
    // Fallback to memory
    return memGet(key);
  },

  async set(key, value, ttlSeconds = TTL.HEATMAP) {
    const serialized = JSON.stringify(value);

    // Write to Redis
    const redis = await getRedis();
    if (redis && redisAvailable) {
      try {
        await redis.setex(key, ttlSeconds, serialized);
      } catch (err) {
        console.warn('[cache] Redis set error:', err.message);
      }
    }

    // Always write to memory as L1
    memSet(key, value, ttlSeconds);
  },

  async del(key) {
    const redis = await getRedis();
    if (redis && redisAvailable) {
      try { await redis.del(key); } catch {}
    }
    memDel(key);
  },

  async delPattern(pattern) {
    // Redis pattern delete
    const redis = await getRedis();
    if (redis && redisAvailable) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) await redis.del(...keys);
      } catch (err) {
        console.warn('[cache] Redis delPattern error:', err.message);
      }
    }
    memDelPattern(pattern);
  },

  // Convenience: get or compute
  async getOrSet(key, computeFn, ttlSeconds) {
    const cached = await cache.get(key);
    if (cached !== null && cached !== undefined) {
      return { data: cached, fromCache: true };
    }
    const data = await computeFn();
    await cache.set(key, data, ttlSeconds);
    return { data, fromCache: false };
  },

  // Cache stats for the admin panel
  async stats() {
    const redis = await getRedis();
    const memStats = {
      entries: memoryCache.size,
      keys: [...memoryCache.keys()].slice(0, 20),
    };

    if (redis && redisAvailable) {
      try {
        const info = await redis.info('memory');
        const keyCount = await redis.dbsize();
        const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1] || 'unknown';
        return {
          backend: 'redis',
          redis: { keys: keyCount, memory: usedMemory },
          memory: memStats,
        };
      } catch {}
    }

    return { backend: 'memory', memory: memStats };
  },

  // Invalidate all MLS cache (e.g. after a manual refresh)
  async invalidateAll() {
    await cache.delPattern('mls:*');
    console.log('[cache] All MLS cache invalidated');
  },

  // Invalidate just a specific state's data
  async invalidateState(state) {
    // We can't reverse-hash, so we store a state→keys index in Redis
    await cache.delPattern(`mls:tiles:*`);
    await cache.delPattern(`mls:heatmap:*`);
    await cache.delPattern(`mls:coverage:*`);
    console.log(`[cache] Invalidated cache for state: ${state}`);
  },
};

module.exports = cache;
module.exports.TTL = TTL;
