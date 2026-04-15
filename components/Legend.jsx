// components/Legend.jsx

const STATUS_COLORS = {
  Active: '#34d399',
  Pending: '#fbbf24',
  Closed: '#f87171',
  Expired: '#9ca3af',
  Withdrawn: '#a78bfa',
  Cancelled: '#fb923c',
  ActiveUnderContract: '#60a5fa',
  ComingSoon: '#2dd4bf',
};

const styles = {
  container: {
    position: 'absolute',
    bottom: '48px',
    right: '16px',
    background: 'rgba(20,23,32,0.92)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    padding: '12px 14px',
    minWidth: '160px',
    zIndex: 10,
    animation: 'fadeIn 0.2s ease',
  },
  title: {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.7px',
    textTransform: 'uppercase',
    color: 'var(--text3)',
    marginBottom: '8px',
  },
  gradientBar: {
    height: '6px',
    borderRadius: '3px',
    marginBottom: '4px',
  },
  gradientLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: 'var(--text3)',
    fontFamily: 'var(--mono)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  label: { fontSize: '12px', color: 'var(--text2)' },
  divider: { height: '1px', background: 'rgba(255,255,255,0.06)', margin: '8px 0' },
};

export default function Legend({ layerMode, activeStatuses, data }) {
  if (!data || data.length === 0) return null;

  return (
    <div style={styles.container}>
      {(layerMode === 'heatmap' || layerMode === 'listingHeatmap') && (
        <>
          <div style={styles.title}>
            {layerMode === 'listingHeatmap' ? 'Listings (sampled, smoothed)' : 'Listing density (bins)'}
          </div>
          <div style={{
            ...styles.gradientBar,
            background: 'linear-gradient(to right, rgba(0,100,255,0.3), rgba(0,255,150,0.6), rgba(255,200,0,0.8), rgba(255,50,0,1))',
          }} />
          <div style={styles.gradientLabels}>
            <span>Low</span>
            <span>High</span>
          </div>
        </>
      )}

      {layerMode === 'dots' && (
        <>
          <div style={styles.title}>Standard status</div>
          {Object.entries(STATUS_COLORS)
            .filter(([s]) => !activeStatuses?.length || activeStatuses.includes(s))
            .slice(0, 8)
            .map(([status, color]) => (
              <div key={status} style={styles.row}>
                <div style={{ ...styles.dot, background: color }} />
                <span style={styles.label}>{status}</span>
              </div>
            ))}
          <div style={styles.divider} />
          <div style={{ ...styles.row, gap: '4px' }}>
            <div style={{ ...styles.dot, background: '#4f8ef7' }} />
            <div style={{ ...styles.dot, background: '#a78bfa' }} />
            <div style={{ ...styles.dot, background: '#f87171' }} />
            <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Cluster size</span>
          </div>
        </>
      )}

      {layerMode === 'coverage' && (
        <>
          <div style={styles.title}>OSN coverage %</div>
          <div style={{
            ...styles.gradientBar,
            background: 'linear-gradient(to right, rgba(79,142,247,0.2), rgba(124,94,247,0.5), rgba(248,113,113,0.9))',
          }} />
          <div style={styles.gradientLabels}>
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
          <div style={styles.divider} />
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
            % of state listings covered by each originating system
          </div>
        </>
      )}

      <div style={styles.divider} />
      <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        {data.length.toLocaleString()} points loaded
      </div>
    </div>
  );
}
