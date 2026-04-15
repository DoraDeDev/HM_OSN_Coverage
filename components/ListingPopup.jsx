// components/ListingPopup.jsx

const styles = {
  popup: {
    padding: '14px 16px',
    minWidth: '220px',
    maxWidth: '280px',
  },
  header: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: '10px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: '10px',
    letterSpacing: '0.3px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
    gap: '8px',
  },
  label: {
    fontSize: '11px',
    color: 'var(--text3)',
    flexShrink: 0,
  },
  value: {
    fontSize: '11px',
    color: 'var(--text2)',
    textAlign: 'right',
    fontFamily: 'var(--mono)',
  },
  valueStrong: {
    fontSize: '12px',
    color: 'var(--text)',
    textAlign: 'right',
    fontFamily: 'var(--mono)',
    fontWeight: 600,
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
    margin: '8px 0',
  },
  coverageBar: {
    height: '4px',
    borderRadius: '2px',
    background: 'rgba(255,255,255,0.1)',
    marginTop: '4px',
    overflow: 'hidden',
  },
  coverageFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
};

const STATUS_COLORS = {
  Active: { bg: 'rgba(52,211,153,0.15)', text: '#34d399' },
  Pending: { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
  Closed: { bg: 'rgba(248,113,113,0.15)', text: '#f87171' },
  Expired: { bg: 'rgba(156,163,175,0.15)', text: '#9ca3af' },
  Withdrawn: { bg: 'rgba(167,139,250,0.15)', text: '#a78bfa' },
  ActiveUnderContract: { bg: 'rgba(96,165,250,0.15)', text: '#60a5fa' },
};

function getCoverageColor(pct) {
  if (pct < 25) return '#4f8ef7';
  if (pct < 50) return '#7c5ef7';
  if (pct < 75) return '#fbbf24';
  return '#f87171';
}

export default function ListingPopup({ properties }) {
  if (!properties) return null;

  const {
    originatingsystemname,
    stateorprovince,
    standardstatus,
    propertytype,
    mls_total_listings,
    total_state_listings,
    coverage_pct,
    listprice,
    city,
  } = properties;

  const statusColor = STATUS_COLORS[standardstatus] || { bg: 'rgba(79,142,247,0.15)', text: '#4f8ef7' };
  const coveragePct = parseFloat(coverage_pct) || 0;

  return (
    <div style={styles.popup}>
      <div style={styles.header}>
        <span className="truncate" style={{ maxWidth: '160px' }}>{originatingsystemname || 'Unknown OSN'}</span>
        {standardstatus && (
          <span style={{ ...styles.statusBadge, background: statusColor.bg, color: statusColor.text }}>
            {standardstatus}
          </span>
        )}
      </div>

      {city && (
        <div style={styles.row}>
          <span style={styles.label}>Location</span>
          <span style={styles.value}>{city}, {stateorprovince}</span>
        </div>
      )}

      {propertytype && (
        <div style={styles.row}>
          <span style={styles.label}>Type</span>
          <span style={styles.value}>{propertytype}</span>
        </div>
      )}

      {listprice && (
        <div style={styles.row}>
          <span style={styles.label}>List price</span>
          <span style={styles.valueStrong}>
            ${parseFloat(listprice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      )}

      <div style={styles.divider} />

      <div style={styles.row}>
        <span style={styles.label}>OSN listings in {stateorprovince}</span>
        <span style={styles.value}>{parseInt(mls_total_listings || 0).toLocaleString()}</span>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>Total state listings</span>
        <span style={styles.value}>{parseInt(total_state_listings || 0).toLocaleString()}</span>
      </div>

      <div style={{ marginTop: '8px' }}>
        <div style={{ ...styles.row, marginBottom: '4px' }}>
          <span style={styles.label}>Coverage</span>
          <span style={{ ...styles.valueStrong, color: getCoverageColor(coveragePct) }}>
            {coveragePct.toFixed(2)}%
          </span>
        </div>
        <div style={styles.coverageBar}>
          <div style={{
            ...styles.coverageFill,
            width: `${Math.min(coveragePct, 100)}%`,
            background: getCoverageColor(coveragePct),
          }} />
        </div>
      </div>
    </div>
  );
}
