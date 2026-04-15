// components/CoverageTable.jsx
import { useState } from 'react';

const styles = {
  container: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '320px',
    background: 'rgba(20,23,32,0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    zIndex: 10,
    overflow: 'hidden',
    maxHeight: 'calc(100vh - 120px)',
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeIn 0.2s ease',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  title: { fontSize: '12px', fontWeight: 600, color: 'var(--text)' },
  subtitle: { fontSize: '11px', color: 'var(--text3)' },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text3)', fontSize: '16px', lineHeight: 1,
    padding: '2px', fontFamily: 'var(--font)',
  },
  body: { flex: 1, overflowY: 'auto', padding: '8px 0' },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 80px 80px',
    gap: '8px',
    padding: '6px 16px',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  colHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 80px 80px',
    gap: '8px',
    padding: '4px 16px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  colLabel: { fontSize: '10px', fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.5px', textTransform: 'uppercase' },
  colLabelRight: { fontSize: '10px', fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'right' },
  osnName: { fontSize: '11px', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  numCell: { fontSize: '11px', color: 'var(--text2)', textAlign: 'right', fontFamily: 'var(--mono)' },
  coverageCell: { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' },
  coveragePct: { fontSize: '12px', fontWeight: 600, fontFamily: 'var(--mono)' },
  bar: { height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', width: '60px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '2px' },
  empty: { padding: '20px 16px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' },
  tabRow: {
    display: 'flex',
    gap: '4px',
    padding: '8px 16px 4px',
    flexShrink: 0,
  },
  tab: {
    fontSize: '11px',
    padding: '3px 10px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text3)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.1s',
  },
  tabActive: {
    background: 'var(--bg4)',
    borderColor: 'rgba(255,255,255,0.15)',
    color: 'var(--text)',
  },
};

function getCoverageColor(pct) {
  if (pct < 10) return '#4f8ef7';
  if (pct < 25) return '#2dd4bf';
  if (pct < 50) return '#34d399';
  if (pct < 75) return '#fbbf24';
  return '#f87171';
}

export default function CoverageTable({ data, onClose, selectedStates }) {
  const [sortBy, setSortBy] = useState('coverage_pct');
  const [sortDir, setSortDir] = useState('desc');
  const [tab, setTab] = useState('all');

  if (!data || data.length === 0) return null;

  // Group by state if multiple states
  const states = [...new Set(data.map(r => r.stateorprovince))].sort();

  const filtered = tab === 'all' ? data : data.filter(r => r.stateorprovince === tab);

  const sorted = [...filtered].sort((a, b) => {
    const av = parseFloat(a[sortBy]) || 0;
    const bv = parseFloat(b[sortBy]) || 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>OSN Coverage</div>
          <div style={styles.subtitle}>{sorted.length} originating systems</div>
        </div>
        <button style={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      {states.length > 1 && (
        <div style={styles.tabRow}>
          <button
            style={{ ...styles.tab, ...(tab === 'all' ? styles.tabActive : {}) }}
            onClick={() => setTab('all')}
          >All</button>
          {states.map(s => (
            <button
              key={s}
              style={{ ...styles.tab, ...(tab === s ? styles.tabActive : {}) }}
              onClick={() => setTab(s)}
            >{s}</button>
          ))}
        </div>
      )}

      <div style={styles.colHeader}>
        <span style={styles.colLabel}>OSN</span>
        <span
          style={{ ...styles.colLabelRight, cursor: 'pointer', color: sortBy === 'osn_listings' ? 'var(--text)' : undefined }}
          onClick={() => handleSort('osn_listings')}
        >Listings {sortBy === 'osn_listings' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</span>
        <span
          style={{ ...styles.colLabelRight, cursor: 'pointer', color: sortBy === 'coverage_pct' ? 'var(--text)' : undefined }}
          onClick={() => handleSort('coverage_pct')}
        >Coverage {sortBy === 'coverage_pct' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</span>
      </div>

      <div style={styles.body}>
        {sorted.length === 0 ? (
          <div style={styles.empty}>No data available</div>
        ) : (
          sorted.map((row, i) => {
            const pct = parseFloat(row.coverage_pct) || 0;
            const color = getCoverageColor(pct);
            return (
              <div
                key={i}
                style={styles.row}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={styles.osnName} title={row.originatingsystemname}>
                  {row.originatingsystemname}
                </span>
                <span style={styles.numCell}>
                  {parseInt(row.osn_listings || 0).toLocaleString()}
                </span>
                <div style={styles.coverageCell}>
                  <span style={{ ...styles.coveragePct, color }}>{pct.toFixed(1)}%</span>
                  <div style={styles.bar}>
                    <div style={{ ...styles.barFill, width: `${Math.min(pct, 100)}%`, background: color }} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
