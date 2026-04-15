# MLS Atlas — Heatmap & Coverage Explorer

Real-estate heatmap over billions of Snowflake listings, served fast via Redis tile caching.

---

## Quick start (Docker — recommended)

```bash
# 1. Copy env template
cp .env.local.example .env.local

# 2. Add your Mapbox token (free at mapbox.com)
echo "NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1..." >> .env.local

# 3. Launch Redis + app
docker-compose up -d

# 4. Open
#   App           → http://localhost:3000
#   Redis UI      → http://localhost:8081
```

That's it. Redis starts first, then the app connects to it automatically.

---

## Local dev (no Docker)

```bash
# Requires: Node 20+, a running Redis instance
redis-server &          # or: brew services start redis

npm install
cp .env.local.example .env.local
# fill in your Mapbox token

npm run dev
# → http://localhost:3000
```

---

## How the cache works

```
Browser → Next.js API route
              │
              ├─ cache.get(key)
              │       │
              │   HIT ─────────────────────────────────→ return JSON (< 5ms)
              │       │
              │   MISS ──→ Snowflake (GROUP BY grid)
              │             └─ cache.set(key, data, TTL)
              │                └─ return JSON
              │
              └─ Redis (primary L1)
                    └─ In-memory LRU (fallback if Redis down)
```

### Cache key strategy

Every request is fingerprinted into a deterministic SHA-256 hash:

```
mls:tiles:<hash of {states, osns, statuses, propertyTypes, precision}>
```

Same filters → same key → always a cache hit after the first load.

### TTL schedule

| Data type       | TTL  | Reason                              |
|-----------------|------|-------------------------------------|
| Tile aggregates | 6h   | State-wide grids change slowly      |
| Coverage %      | 4h   | OSN share shifts daily              |
| Heatmap tiles   | 2h   | Filtered smaller sets               |
| Filter options  | 24h  | States/OSNs/statuses rarely change  |
| Viewport tiles  | 2h   | Pan/zoom specific                   |

### Why tile aggregation instead of raw rows

With billions of records, pulling raw lat/lon rows is impractical. Instead, the app asks Snowflake to pre-aggregate on the server side:

```sql
SELECT
    ROUND(FLOOR(latitude  / 0.5) * 0.5 + 0.25, 6) AS cell_lat,
    ROUND(FLOOR(longitude / 0.5) * 0.5 + 0.25, 6) AS cell_lon,
    COUNT(*)     AS listing_count,
    AVG(listprice),
    coverage_pct,
    ...
FROM listing
GROUP BY FLOOR(latitude/0.5), FLOOR(longitude/0.5), ...
```

Grid cell size adapts to zoom level:

| Zoom | Cell size | Coverage     |
|------|-----------|--------------|
| 0–5  | 1.0°      | ~111 km/cell |
| 6–8  | 0.5°      | ~55 km/cell  |
| 9–10 | 0.2°      | ~22 km/cell  |
| 11–12| 0.1°      | ~11 km/cell  |
| 13+  | 0.05°     | ~5 km/cell   |

A billion-row table may return just 50,000 aggregated cells — perfectly cacheable.

---

## Cache management

### Via Redis Commander UI

Open **http://localhost:8081** to browse all keys, see TTLs, and delete entries visually.

### Via API endpoints

```bash
# View cache stats (key count, memory usage)
curl http://localhost:3000/api/cache-admin?action=stats \
  -H "x-admin-token: changeme"

# Invalidate ALL cached data (triggers fresh SF queries on next load)
curl -X POST http://localhost:3000/api/cache-admin?action=invalidate-all \
  -H "x-admin-token: changeme"

# Invalidate a specific state's tiles
curl -X POST http://localhost:3000/api/cache-admin?action=invalidate-state \
  -H "x-admin-token: changeme" \
  -H "Content-Type: application/json" \
  -d '{"state": "FL"}'

# Invalidate filter dropdowns (states, OSNs, statuses)
curl -X POST http://localhost:3000/api/cache-admin?action=invalidate-filters \
  -H "x-admin-token: changeme"
```

### Via the UI

In the left panel, after loading data, a **"↺ Bypass cache — re-query Snowflake"** button appears. Clicking it forces a fresh query and overwrites the cached result.

---

## Environment variables

| Variable                    | Required | Description                          |
|-----------------------------|----------|--------------------------------------|
| `NEXT_PUBLIC_MAPBOX_TOKEN`  | ✅       | Mapbox GL token                      |
| `SF_ACCOUNT`                | ✅       | Snowflake account identifier         |
| `SF_USER`                   | ✅       | Snowflake username                   |
| `SF_PASSWORD`               | ✅       | Snowflake password                   |
| `SF_WAREHOUSE`              | ✅       | Snowflake warehouse                  |
| `SF_ROLE`                   | ✅       | Snowflake role                       |
| `SF_DATABASE`               | ✅       | Database (`PROD_SKYLINE`)            |
| `SF_SCHEMA`                 | ✅       | Schema (`L20_CURATED`)               |
| `REDIS_URL`                 | ⚡       | Redis URL (default: localhost:6379)  |
| `CACHE_ADMIN_TOKEN`         | 🔒       | Token for `/api/cache-admin`         |

---

## Project structure

```
pages/
  index.jsx               Main app
  api/
    heatmap.js            Tile-aggregated heatmap (cached)
    filters.js            Dropdown options (cached 24h)
    coverage.js           OSN coverage summary (cached 4h)
    tiles.js              Viewport-bounded tiles for pan/zoom
    agent.js              AI natural-language filter assistant
    cache-admin.js        Cache stats & invalidation

lib/
  cache.js                Redis + in-memory LRU cache manager
  tiles.js                Hex-tile SQL aggregation queries
  queries.js              All Snowflake SQL
  snowflake.js            Snowflake connection pool

components/
  FilterPanel.jsx         Left sidebar filters
  MapView.jsx             Mapbox GL heatmap/dots/coverage layers
  Legend.jsx              Map color scale legend
  ListingPopup.jsx        Click-to-inspect listing popup
  CoverageTable.jsx       Sortable OSN coverage table
  AgentChat.jsx           AI filter assistant chat

redis/
  redis.conf              Tuned Redis config (optional override)

docker-compose.yml        Redis + Redis UI + App
Dockerfile                Multi-stage production image
```

---

## Scaling notes

- **Redis maxmemory** is set to 2GB. With typical aggregated tile payloads (50K rows × ~200 bytes ≈ 10MB per state query), you can cache ~200 unique filter combinations before eviction kicks in.
- **Snowflake warehouse**: `COMPUTE_WH` will auto-suspend. First load per filter set wakes it up (10–30s). Subsequent loads hit Redis in < 5ms.
- **AOF persistence**: Redis saves to disk every second. If Docker restarts, the cache survives and avoids a cold-start Snowflake storm.
