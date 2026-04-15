// lib/tiles.js
// Hex-tile aggregation engine for billions of records
// Uses Snowflake-side aggregation (GROUP BY grid cell) so we never pull raw rows
// H3-compatible grid using lat/lon bucketing at multiple zoom levels

/**
 * Zoom level → grid precision mapping
 * precision 2 = 0.5°, 4 = 0.1° (~11 km bins), 5 = 0.05° (~5.5 km)
 * State/metro views use 0.1° cells so the map reads as many small bins (granular
 * blue specks in rural areas, merged red in cities) like a classic density layer.
 */
const ZOOM_PRECISION = {
  0: 2,
  1: 2,
  2: 2,
  3: 2,
  4: 4,
  5: 4,
  6: 4,
  7: 4,
  8: 4,
  9: 4,
  10: 4,
  11: 4,
  12: 4,
  13: 5,
  14: 5,
  15: 5,
};

/**
 * Integer map zoom → H3 resolution (Snowflake H3_LATLNG_TO_CELL_STRING).
 * Ramps faster past z~9 so city / neighborhood views (z~11-13) hit res 8-9 (neighborhood-scale hexes).
 * z16+ caps at 11 (~150 m hexes) to bound row counts.
 */
const ZOOM_H3_MAX_ZOOM = 18;

const ZOOM_H3_RES = {
  0: 3,
  1: 3,
  2: 3,
  3: 4,
  4: 5,
  5: 5,
  6: 6,
  7: 7,
  8: 7,
  9: 8,
  10: 8,
  11: 9,
  12: 9,
  13: 10,
  14: 10,
  15: 11,
  16: 11,
  17: 11,
  18: 11,
};

/**
 * Smooth H3 resolution from fractional zoom (interpolates between integer zoom steps).
 * Result is clamped to valid H3 index resolution 0–15.
 */
function h3ResolutionForZoom(zoom) {
  const z = Math.min(ZOOM_H3_MAX_ZOOM, Math.max(0, Number(zoom) || 0));
  const z0 = Math.floor(z);
  const z1 = Math.min(ZOOM_H3_MAX_ZOOM, z0 + 1);
  const t = z - z0;
  const r0 = ZOOM_H3_RES[z0] ?? ZOOM_H3_RES[15];
  const r1 = ZOOM_H3_RES[z1] ?? r0;
  const blended = r0 + (r1 - r0) * t;
  return Math.min(15, Math.max(0, Math.round(blended)));
}

/** Escape + trim for SQL string IN (...) — matches TRIM(column) in Snowflake */
function sqlInList(vals) {
  if (!vals || vals.length === 0) return '';
  return vals.map((v) => `'${String(v).trim().replace(/'/g, "''")}'`).join(',');
}

/** Placeholder / junk RESO standardstatus — omit from aggregations */
const EXCL_STD_H = `AND TRIM(COALESCE(standardstatus, '')) != 'H'`;
const EXCL_STD_H_L = `AND TRIM(COALESCE(l.standardstatus, '')) != 'H'`;

/**
 * Build a Snowflake query that aggregates listings into grid cells
 * Returns one row per grid cell with counts, coverage, etc.
 * This is what makes billions of records tractable on the map.
 */
function getTileAggregationQuery({ states = [], osns = [], statuses = [], propertyTypes = [], precision = 2 }) {
  // Grid cell size in degrees based on precision
  // precision 1 = 1.0°, 2 = 0.5°, 3 = 0.2°, 4 = 0.1°, 5 = 0.05°
  const cellSizes = { 1: 1.0, 2: 0.5, 3: 0.2, 4: 0.1, 5: 0.05 };
  const cellSize = cellSizes[precision] || 0.5;

  const stateFilter = states.length > 0
    ? `AND l.stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const osnFilter = osns.length > 0
    ? `AND l.originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';
  /** mls_state_totals CTE uses LISTING without alias — must not use l. */
  const osnFilterCTE = osns.length > 0
    ? `AND originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const statusFilter = statuses.length > 0
    ? `AND TRIM(l.standardstatus) IN (${sqlInList(statuses)})`
    : '';
  const propertyFilter = propertyTypes.length > 0
    ? `AND TRIM(l.propertytype) IN (${sqlInList(propertyTypes)})`
    : '';

  const stateFilterCTE = states.length > 0
    ? `AND stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';

  // One GeoJSON point per grid cell (optionally split by state when several are selected).
  const groupByState = states.length > 1;
  const stateSelect = groupByState
    ? 'l.stateorprovince AS stateorprovince,'
    : 'MAX(l.stateorprovince) AS stateorprovince,';
  const groupSuffix = groupByState
    ? `,
        l.stateorprovince`
    : '';

  return `
WITH state_totals AS (
    SELECT stateorprovince, COUNT(*) AS total_state_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilterCTE}
    GROUP BY stateorprovince
),
mls_state_totals AS (
    SELECT originatingsystemname, stateorprovince, COUNT(*) AS mls_total_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilterCTE}
      ${osnFilterCTE}
    GROUP BY originatingsystemname, stateorprovince
),
grid_aggregated AS (
    SELECT
        -- Snap lat/lon to grid cell center (Snowflake-side bucketing)
        ROUND(FLOOR(l.latitude  / ${cellSize}) * ${cellSize} + ${cellSize / 2}, 6) AS cell_lat,
        ROUND(FLOOR(l.longitude / ${cellSize}) * ${cellSize} + ${cellSize / 2}, 6) AS cell_lon,
        ${stateSelect}
        ANY_VALUE(l.originatingsystemname)         AS originatingsystemname,
        ANY_VALUE(l.standardstatus)                AS standardstatus,
        ANY_VALUE(l.propertytype)                  AS propertytype,
        COUNT(*)                                    AS listing_count,
        AVG(l.listprice)                            AS avg_price,
        MIN(l.listprice)                            AS min_price,
        MAX(l.listprice)                            AS max_price,
        ANY_VALUE(mst.mls_total_listings)           AS mls_total_listings,
        ANY_VALUE(st.total_state_listings)         AS total_state_listings,
        ANY_VALUE(ROUND(
          (mst.mls_total_listings::FLOAT / NULLIF(st.total_state_listings, 0)) * 100,
          4
        ))                                          AS coverage_pct
    FROM PROD_SKYLINE.L20_CURATED.LISTING l
    JOIN mls_state_totals mst
        ON l.originatingsystemname = mst.originatingsystemname
       AND l.stateorprovince = mst.stateorprovince
    JOIN state_totals st
        ON l.stateorprovince = st.stateorprovince
    WHERE l.latitude  IS NOT NULL
      AND l.longitude IS NOT NULL
      AND l.latitude  BETWEEN 24 AND 72
      AND l.longitude BETWEEN -170 AND -50
      AND l.originatingsystemname IS NOT NULL AND TRIM(l.originatingsystemname) != ''
      AND l.stateorprovince IS NOT NULL AND TRIM(l.stateorprovince) != ''
      ${EXCL_STD_H_L}
      ${stateFilter}
      ${osnFilter}
      ${statusFilter}
      ${propertyFilter}
    GROUP BY
        FLOOR(l.latitude  / ${cellSize}),
        FLOOR(l.longitude / ${cellSize})${groupSuffix}
)
SELECT
    cell_lat        AS latitude,
    cell_lon        AS longitude,
    stateorprovince,
    originatingsystemname,
    standardstatus,
    propertytype,
    listing_count,
    ROUND(avg_price, 0)   AS avg_price,
    min_price,
    max_price,
    mls_total_listings,
    total_state_listings,
    coverage_pct
FROM grid_aggregated
ORDER BY listing_count DESC
  `.trim();
}

/**
 * Query for viewport-bounded tiles (pan/zoom aware)
 * Only fetches tiles visible in the current map viewport
 */
function getViewportTileQuery({ states, osns, statuses, propertyTypes, precision, bounds }) {
  const { north, south, east, west } = bounds;
  const boundsFilter = `
    AND latitude  BETWEEN ${south} AND ${north}
    AND longitude BETWEEN ${west}  AND ${east}
  `;

  const cellSizes = { 1: 1.0, 2: 0.5, 3: 0.2, 4: 0.1, 5: 0.05 };
  const cellSize = cellSizes[precision] || 0.5;

  const stateFilter = states?.length > 0
    ? `AND stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const osnFilter = osns?.length > 0
    ? `AND originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const statusFilter = statuses?.length > 0
    ? `AND TRIM(standardstatus) IN (${sqlInList(statuses)})`
    : '';
  const propertyFilter = propertyTypes?.length > 0
    ? `AND TRIM(propertytype) IN (${sqlInList(propertyTypes)})`
    : '';

  return `
SELECT
    ROUND(FLOOR(latitude  / ${cellSize}) * ${cellSize} + ${cellSize / 2}, 6) AS latitude,
    ROUND(FLOOR(longitude / ${cellSize}) * ${cellSize} + ${cellSize / 2}, 6) AS longitude,
    stateorprovince,
    originatingsystemname,
    standardstatus,
    propertytype,
    COUNT(*)       AS listing_count,
    AVG(listprice) AS avg_price
FROM PROD_SKYLINE.L20_CURATED.LISTING
WHERE latitude  IS NOT NULL AND longitude IS NOT NULL
  AND latitude  BETWEEN 24 AND 72
  AND longitude BETWEEN -170 AND -50
  ${EXCL_STD_H}
  ${boundsFilter}
  ${stateFilter}
  ${osnFilter}
  ${statusFilter}
  ${propertyFilter}
GROUP BY
    FLOOR(latitude  / ${cellSize}),
    FLOOR(longitude / ${cellSize}),
    stateorprovince,
    originatingsystemname,
    standardstatus,
    propertytype
ORDER BY listing_count DESC
  `.trim();
}

/**
 * Heatmap density query — groups ONLY by geographic cell (0.1° ≈ 11km).
 * Returns one row per lat/lon cell with total listing count.
 * Many more, finer-grained points → the fine-grained cloud look in the heatmap.
 */
function getHeatmapDensityQuery({ states = [], osns = [], statuses = [], propertyTypes = [] }) {
  const CELL = 0.1; // ~11 km resolution

  const stateFilter = states.length > 0
    ? `AND stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const osnFilter = osns.length > 0
    ? `AND originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const statusFilter = statuses.length > 0
    ? `AND TRIM(standardstatus) IN (${sqlInList(statuses)})`
    : '';
  const propertyFilter = propertyTypes.length > 0
    ? `AND TRIM(propertytype) IN (${sqlInList(propertyTypes)})`
    : '';

  return `
SELECT
    ROUND(FLOOR(latitude  / ${CELL}) * ${CELL} + ${CELL / 2}, 6) AS latitude,
    ROUND(FLOOR(longitude / ${CELL}) * ${CELL} + ${CELL / 2}, 6) AS longitude,
    COUNT(*) AS listing_count
FROM PROD_SKYLINE.L20_CURATED.LISTING
WHERE latitude  IS NOT NULL
  AND longitude IS NOT NULL
  AND latitude  BETWEEN 24 AND 72
  AND longitude BETWEEN -170 AND -50
  ${EXCL_STD_H}
  ${stateFilter}
  ${osnFilter}
  ${statusFilter}
  ${propertyFilter}
GROUP BY
    FLOOR(latitude  / ${CELL}),
    FLOOR(longitude / ${CELL})
ORDER BY listing_count DESC
LIMIT 500000
  `.trim();
}

/**
 * One row per H3 cell. Requires Snowflake H3 (H3_LATLNG_TO_CELL_STRING).
 */
function getH3TileAggregationQuery({ states = [], osns = [], statuses = [], propertyTypes = [], h3Res = 6 }) {
  const res = Math.min(15, Math.max(0, Math.floor(Number(h3Res) || 6)));

  const stateFilter = states.length > 0
    ? `AND l.stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const osnFilter = osns.length > 0
    ? `AND l.originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const osnFilterCTE = osns.length > 0
    ? `AND originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const statusFilter = statuses.length > 0
    ? `AND TRIM(l.standardstatus) IN (${sqlInList(statuses)})`
    : '';
  const propertyFilter = propertyTypes.length > 0
    ? `AND TRIM(l.propertytype) IN (${sqlInList(propertyTypes)})`
    : '';

  const stateFilterCTE = states.length > 0
    ? `AND stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';

  const groupByState = states.length > 1;
  const stateSelect = groupByState
    ? 'l.stateorprovince AS stateorprovince,'
    : 'MAX(l.stateorprovince) AS stateorprovince,';
  const groupSuffix = groupByState
    ? `,
        l.stateorprovince`
    : '';

  return `
WITH state_totals AS (
    SELECT stateorprovince, COUNT(*) AS total_state_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilterCTE}
    GROUP BY stateorprovince
),
mls_state_totals AS (
    SELECT originatingsystemname, stateorprovince, COUNT(*) AS mls_total_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilterCTE}
      ${osnFilterCTE}
    GROUP BY originatingsystemname, stateorprovince
),
h3_aggregated AS (
    SELECT
        H3_LATLNG_TO_CELL_STRING(l.latitude, l.longitude, ${res}) AS h3,
        ${stateSelect}
        ANY_VALUE(l.originatingsystemname)         AS originatingsystemname,
        ANY_VALUE(l.standardstatus)                AS standardstatus,
        ANY_VALUE(l.propertytype)                  AS propertytype,
        COUNT(*)                                    AS listing_count,
        AVG(l.listprice)                            AS avg_price,
        MIN(l.listprice)                            AS min_price,
        MAX(l.listprice)                            AS max_price,
        ANY_VALUE(mst.mls_total_listings)           AS mls_total_listings,
        ANY_VALUE(st.total_state_listings)         AS total_state_listings,
        ANY_VALUE(ROUND(
          (mst.mls_total_listings::FLOAT / NULLIF(st.total_state_listings, 0)) * 100,
          4
        ))                                          AS coverage_pct
    FROM PROD_SKYLINE.L20_CURATED.LISTING l
    JOIN mls_state_totals mst
        ON l.originatingsystemname = mst.originatingsystemname
       AND l.stateorprovince = mst.stateorprovince
    JOIN state_totals st
        ON l.stateorprovince = st.stateorprovince
    WHERE l.latitude  IS NOT NULL
      AND l.longitude IS NOT NULL
      AND l.latitude  BETWEEN 24 AND 72
      AND l.longitude BETWEEN -170 AND -50
      AND l.originatingsystemname IS NOT NULL AND TRIM(l.originatingsystemname) != ''
      AND l.stateorprovince IS NOT NULL AND TRIM(l.stateorprovince) != ''
      ${EXCL_STD_H_L}
      ${stateFilter}
      ${osnFilter}
      ${statusFilter}
      ${propertyFilter}
    GROUP BY
        H3_LATLNG_TO_CELL_STRING(l.latitude, l.longitude, ${res})${groupSuffix}
)
SELECT
    h3,
    stateorprovince,
    originatingsystemname,
    standardstatus,
    propertytype,
    listing_count,
    ROUND(avg_price, 0)   AS avg_price,
    min_price,
    max_price,
    mls_total_listings,
    total_state_listings,
    coverage_pct
FROM h3_aggregated
WHERE h3 IS NOT NULL AND TRIM(h3) != ''
ORDER BY listing_count DESC `.trim();
}

/**
 * Random sample of listing rows for HeatmapLayer (one weight per listing, blurred into density).
 * Uses TABLESAMPLE BERNOULLI on the fact table, same MLS/state filters as tile queries.
 * Tune HEATMAP_POINT_BERNOULLI_PCT / HEATMAP_POINT_LIMIT on the server.
 */
function getListingPointsHeatmapQuery({
  states = [],
  osns = [],
  statuses = [],
  propertyTypes = [],
  bernoulliPct = 2,
  rowLimit = 300000,
}) {
  const pct = Math.min(100, Math.max(0.001, Number(bernoulliPct) || 2));
  const limit = Math.min(500000, Math.max(1000, Math.floor(Number(rowLimit) || 300000)));

  const stateFilter = states.length > 0
    ? `AND l.stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const osnFilter = osns.length > 0
    ? `AND l.originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const osnFilterCTE = osns.length > 0
    ? `AND originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const statusFilter = statuses.length > 0
    ? `AND TRIM(l.standardstatus) IN (${sqlInList(statuses)})`
    : '';
  const propertyFilter = propertyTypes.length > 0
    ? `AND TRIM(l.propertytype) IN (${sqlInList(propertyTypes)})`
    : '';

  const stateFilterCTE = states.length > 0
    ? `AND stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';

  return `
WITH state_totals AS (
    SELECT stateorprovince, COUNT(*) AS total_state_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilterCTE}
    GROUP BY stateorprovince
),
mls_state_totals AS (
    SELECT originatingsystemname, stateorprovince, COUNT(*) AS mls_total_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilterCTE}
      ${osnFilterCTE}
    GROUP BY originatingsystemname, stateorprovince
)
SELECT
    l.latitude  AS latitude,
    l.longitude AS longitude,
    l.stateorprovince AS stateorprovince
FROM PROD_SKYLINE.L20_CURATED.LISTING l TABLESAMPLE BERNOULLI (${pct})
JOIN mls_state_totals mst
    ON l.originatingsystemname = mst.originatingsystemname
   AND l.stateorprovince = mst.stateorprovince
JOIN state_totals st
    ON l.stateorprovince = st.stateorprovince
WHERE l.latitude  IS NOT NULL
  AND l.longitude IS NOT NULL
  AND l.latitude  BETWEEN 24 AND 72
  AND l.longitude BETWEEN -170 AND -50
  AND l.originatingsystemname IS NOT NULL AND TRIM(l.originatingsystemname) != ''
  AND l.stateorprovince IS NOT NULL AND TRIM(l.stateorprovince) != ''
  ${EXCL_STD_H_L}
  ${stateFilter}
  ${osnFilter}
  ${statusFilter}
  ${propertyFilter}
LIMIT ${limit} `.trim();
}

module.exports = {
  getTileAggregationQuery,
  getViewportTileQuery,
  getHeatmapDensityQuery,
  getH3TileAggregationQuery,
  getListingPointsHeatmapQuery,
  ZOOM_PRECISION,
  ZOOM_H3_RES,
  ZOOM_H3_MAX_ZOOM,
  h3ResolutionForZoom,
};
