// lib/queries.js
// All Snowflake SQL queries for the MLS Heatmap application

function sqlInList(vals) {
  if (!vals || vals.length === 0) return '';
  return vals.map((v) => `'${String(v).trim().replace(/'/g, "''")}'`).join(',');
}

/** Placeholder / junk RESO standardstatus — omit from filters and aggregations */
const EXCL_STD_H = `AND TRIM(COALESCE(standardstatus, '')) != 'H'`;
const EXCL_STD_H_L = `AND TRIM(COALESCE(l.standardstatus, '')) != 'H'`;

/**
 * Main heatmap data query — returns lat/long + all listing metadata
 * Supports dynamic state filter, OSN filter, status filter, property type
 */
function getHeatmapQuery({ states = [], osns = [], statuses = [], propertyTypes = [] }) {
  const stateFilter = states.length > 0
    ? `AND l.stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';

  const osnFilter = osns.length > 0
    ? `AND l.originatingsystemname IN (${osns.map(o => `'${o.replace(/'/g, "''")}'`).join(',')})`
    : '';

  const statusFilter = statuses.length > 0
    ? `AND TRIM(l.standardstatus) IN (${statuses.map(s => `'${String(s).trim().replace(/'/g, "''")}'`).join(',')})`
    : '';

  const propertyFilter = propertyTypes.length > 0
    ? `AND TRIM(l.propertytype) IN (${propertyTypes.map(p => `'${String(p).trim().replace(/'/g, "''")}'`).join(',')})`
    : '';

  const stateFilterForCTE = states.length > 0
    ? `AND stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';

  return `
WITH state_totals AS (
    SELECT 
        stateorprovince, 
        COUNT(*) AS total_state_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilterForCTE}
    GROUP BY stateorprovince
),
mls_state_totals AS (
    SELECT 
        originatingsystemname, 
        stateorprovince, 
        COUNT(*) AS mls_total_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilterForCTE}
    GROUP BY originatingsystemname, stateorprovince
),
filtered_listings AS (
    SELECT 
        l.listingkey,
        l.originatingsystemname,
        l.stateorprovince,
        l.latitude,
        l.longitude,
        l.standardstatus,
        l.propertytype,
        l.listprice,
        l.city,
        l.postalcode,
        l.listingcontractdate,
        mst.mls_total_listings,
        st.total_state_listings,
        ROUND((mst.mls_total_listings::FLOAT / NULLIF(st.total_state_listings, 0)) * 100, 4) AS coverage_pct
    FROM PROD_SKYLINE.L20_CURATED.LISTING l
    JOIN mls_state_totals mst
        ON l.originatingsystemname = mst.originatingsystemname
       AND l.stateorprovince = mst.stateorprovince
    JOIN state_totals st
        ON l.stateorprovince = st.stateorprovince
    WHERE l.originatingsystemname IS NOT NULL AND TRIM(l.originatingsystemname) != ''
      AND l.stateorprovince IS NOT NULL AND TRIM(l.stateorprovince) != ''
      AND l.latitude IS NOT NULL
      AND l.longitude IS NOT NULL
      AND l.latitude  BETWEEN 24 AND 72
      AND l.longitude BETWEEN -170 AND -50
      ${EXCL_STD_H_L}
      ${stateFilter}
      ${osnFilter}
      ${statusFilter}
      ${propertyFilter}
)
SELECT * FROM filtered_listings
ORDER BY originatingsystemname, stateorprovince
LIMIT 100000
  `.trim();
}

/**
 * Get distinct states that have listings
 */
const GET_STATES = `
  SELECT DISTINCT stateorprovince
  FROM PROD_SKYLINE.L20_CURATED.LISTING
  WHERE stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    ${EXCL_STD_H}
  ORDER BY stateorprovince
`;

/**
 * Distinct MLS (OSN) with at least one listing matching state + optional status/property slice.
 * Aligns dropdown with heatmap/coverage filters (e.g. only MLS with Closed in TX).
 */
function getOSNQuery({ states = [], statuses = [], propertyTypes = [] } = {}) {
  const stateFilter = states.length > 0
    ? `AND stateorprovince IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const statusFilter = statuses.length > 0
    ? `AND TRIM(standardstatus) IN (${sqlInList(statuses)})`
    : '';
  const propertyFilter = propertyTypes.length > 0
    ? `AND TRIM(propertytype) IN (${sqlInList(propertyTypes)})`
    : '';
  return `
    SELECT DISTINCT originatingsystemname
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude  BETWEEN 24 AND 72
      AND longitude BETWEEN -170 AND -50
      ${EXCL_STD_H}
      ${stateFilter}
      ${statusFilter}
      ${propertyFilter}
    ORDER BY originatingsystemname
  `;
}

/**
 * Get distinct standard statuses
 */
const GET_STATUSES = `
  SELECT DISTINCT standardstatus
  FROM PROD_SKYLINE.L20_CURATED.LISTING
  WHERE standardstatus IS NOT NULL AND TRIM(standardstatus) != ''
    AND TRIM(standardstatus) != 'H'
  ORDER BY standardstatus
`;

/**
 * Get distinct property types
 */
const GET_PROPERTY_TYPES = `
  SELECT DISTINCT propertytype
  FROM PROD_SKYLINE.L20_CURATED.LISTING
  WHERE propertytype IS NOT NULL AND TRIM(propertytype) != ''
    ${EXCL_STD_H}
  ORDER BY propertytype
`;

/**
 * OSN coverage summary per state
 */
function getOSNCoverageQuery({ states = [], osns = [], statuses = [], propertyTypes = [] }) {
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
WITH state_totals AS (
    SELECT stateorprovince, COUNT(*) AS total_state_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilter}
      ${statusFilter}
      ${propertyFilter}
    GROUP BY stateorprovince
),
osn_totals AS (
    SELECT originatingsystemname, stateorprovince, COUNT(*) AS osn_listings
    FROM PROD_SKYLINE.L20_CURATED.LISTING
    WHERE originatingsystemname IS NOT NULL AND TRIM(originatingsystemname) != ''
      AND stateorprovince IS NOT NULL AND TRIM(stateorprovince) != ''
      ${EXCL_STD_H}
      ${stateFilter}
      ${osnFilter}
      ${statusFilter}
      ${propertyFilter}
    GROUP BY originatingsystemname, stateorprovince
)
SELECT 
    o.originatingsystemname,
    o.stateorprovince,
    o.osn_listings,
    s.total_state_listings,
    ROUND((o.osn_listings::FLOAT / NULLIF(s.total_state_listings, 0)) * 100, 2) AS coverage_pct
FROM osn_totals o
JOIN state_totals s ON o.stateorprovince = s.stateorprovince
ORDER BY coverage_pct DESC
  `;
}

module.exports = {
  getHeatmapQuery,
  GET_STATES,
  getOSNQuery,
  GET_STATUSES,
  GET_PROPERTY_TYPES,
  getOSNCoverageQuery,
};
