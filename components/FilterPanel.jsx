// components/FilterPanel.jsx
import { useState } from 'react';

const styles = {
  panel: {
    width: '280px',
    minWidth: '280px',
    height: '100%',
    background: 'var(--bg2)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  logo: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text)',
    letterSpacing: '-0.3px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '2px',
  },
  logoAccent: { color: 'var(--accent)' },
  subtitle: { fontSize: '11px', color: 'var(--text3)', letterSpacing: '0.5px', textTransform: 'uppercase' },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 0',
  },
  section: {
    padding: '8px 20px 12px',
    borderBottom: '1px solid var(--border)',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'var(--text3)',
    marginBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  clearBtn: {
    fontSize: '10px',
    color: 'var(--accent)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0',
    fontFamily: 'var(--font)',
  },
  selectAllBtn: {
    fontSize: '10px',
    color: 'var(--text3)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0',
    fontFamily: 'var(--font)',
  },
  checkList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '160px',
    overflowY: 'auto',
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 6px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.1s',
    userSelect: 'none',
  },
  checkBox: {
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    border: '1.5px solid var(--border2)',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.1s',
  },
  checkBoxActive: {
    background: 'var(--accent)',
    border: '1.5px solid var(--accent)',
  },
  checkMark: { width: '8px', height: '8px', color: '#fff', fontSize: '9px', fontWeight: 700 },
  checkLabel: { fontSize: '13px', color: 'var(--text2)', flex: 1 },
  checkLabelActive: { color: 'var(--text)' },
  badge: {
    fontSize: '10px',
    color: 'var(--text3)',
    background: 'var(--bg4)',
    padding: '1px 6px',
    borderRadius: '10px',
    fontFamily: 'var(--mono)',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  loadBtn: {
    width: '100%',
    padding: '10px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'opacity 0.15s',
    letterSpacing: '0.2px',
  },
  loadBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  statsRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '10px',
  },
  statCard: {
    flex: 1,
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '8px 10px',
  },
  statLabel: { fontSize: '10px', color: 'var(--text3)', marginBottom: '2px' },
  statValue: { fontSize: '16px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)' },
  refreshBtn: {
    width: '100%',
    padding: '7px',
    background: 'transparent',
    color: 'var(--text3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    marginTop: '6px',
    transition: 'all 0.15s',
  },
  spinner: {
    width: '14px', height: '14px',
    border: '2px solid rgba(255,255,255,0.2)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
    marginRight: '6px',
    verticalAlign: 'middle',
  },
  layerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  layerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text2)',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'var(--font)',
    transition: 'all 0.1s',
    textAlign: 'left',
  },
  layerBtnActive: {
    background: 'var(--bg4)',
    borderColor: 'var(--accent)',
    color: 'var(--text)',
  },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    marginTop: '4px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
  },
  toggleLabel: {
    fontSize: '12px',
    color: 'var(--text2)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toggleSwitch: {
    width: '28px',
    height: '16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s',
    position: 'relative',
    flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute',
    top: '2px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.15s',
  },
  searchBox: {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text)',
    fontSize: '12px',
    fontFamily: 'var(--font)',
    marginBottom: '6px',
    outline: 'none',
    boxSizing: 'border-box',
  },
};

function CheckItem({ label, checked, onChange }) {
  return (
    <div
      style={styles.checkItem}
      onClick={onChange}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ ...styles.checkBox, ...(checked ? styles.checkBoxActive : {}) }}>
        {checked && <span style={styles.checkMark}>✓</span>}
      </div>
      <span style={{ ...styles.checkLabel, ...(checked ? styles.checkLabelActive : {}) }}>
        {label}
      </span>
    </div>
  );
}

function Toggle({ on, onToggle }) {
  return (
    <button
      style={{
        ...styles.toggleSwitch,
        background: on ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
      }}
      onClick={onToggle}
    >
      <div style={{ ...styles.toggleKnob, left: on ? '14px' : '2px' }} />
    </button>
  );
}

export default function FilterPanel({
  filters,
  onFiltersChange,
  onLoad,
  onForceRefresh,
  loading,
  options,
  optionsLoading,
  dataStats,
  eligibleOsnCount,
  layerMode,
  onLayerModeChange,
  showBoundaries,
  onBoundariesToggle,
}) {
  const [stateSearch, setStateSearch] = useState('');
  const [osnSearch, setOsnSearch] = useState('');

  const filteredStates = (options.states || []).filter(s =>
    s.toLowerCase().includes(stateSearch.toLowerCase())
  );
  const filteredOsns = (options.osns || []).filter(o =>
    o.toLowerCase().includes(osnSearch.toLowerCase())
  );

  const toggle = (key, value) => {
    const arr = filters[key] || [];
    const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
    const extra = key === 'states' && next.length === 0 ? { osns: [] } : {};
    onFiltersChange({ ...filters, [key]: next, ...extra });
  };

  const selectAll = (key, allValues) => {
    onFiltersChange({ ...filters, [key]: [...allValues] });
  };

  const clearAll = (key, extra = {}) => {
    onFiltersChange({ ...filters, [key]: [], ...extra });
  };

  const allStatesSelected = filteredStates.length > 0 &&
    filteredStates.every(s => (filters.states || []).includes(s));

  const allOsnsSelected = filteredOsns.length > 0 &&
    filteredOsns.every(o => (filters.osns || []).includes(o));

  const allStatusesSelected = (options.statuses || []).length > 0 &&
    (options.statuses || []).every(s => (filters.statuses || []).includes(s));

  const allTypesSelected = (options.propertyTypes || []).length > 0 &&
    (options.propertyTypes || []).every(p => (filters.propertyTypes || []).includes(p));

  const canLoad = filters.states?.length > 0;

  const layers = [
    { id: 'heatmap', label: 'Bins (H3 / grid)', color: '#f87171' },
    { id: 'listingHeatmap', label: 'Heatmap (listings)', color: '#fb7185' },
    { id: 'dots', label: 'Individual listings', color: '#4f8ef7' },
    { id: 'coverage', label: 'OSN coverage', color: '#34d399' },
  ];

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={{ fontSize: '18px' }}>◈</span>
          <span>MLS <span style={styles.logoAccent}>Atlas</span></span>
        </div>
        <div style={styles.subtitle}>Heatmap & Coverage Explorer</div>
      </div>

      {/* Body */}
      <div style={styles.body}>

        {/* Stats */}
        {dataStats && (
          <div style={{ padding: '10px 20px 0' }}>
            <div style={styles.statsRow}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>Total listings</div>
                <div style={styles.statValue}>{(dataStats.totalListings ?? 0).toLocaleString()}</div>
                {dataStats.mapCells != null && dataStats.mapCells > 0 && (
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                    {dataStats.mapCells.toLocaleString()} map cells
                  </div>
                )}
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>States</div>
                <div style={styles.statValue}>{dataStats.stateCount || 0}</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>MLS in slice</div>
                <div style={styles.statValue}>
                  {(eligibleOsnCount != null ? eligibleOsnCount : dataStats.osnCount || 0).toLocaleString()}
                </div>
                {eligibleOsnCount != null && dataStats.osnCount > 0 && eligibleOsnCount !== dataStats.osnCount && (
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                    {dataStats.osnCount} on map
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Map Layer + Boundaries */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Map Layer</div>
          <div style={styles.layerRow}>
            {layers.map(l => (
              <button
                key={l.id}
                style={{ ...styles.layerBtn, ...(layerMode === l.id ? styles.layerBtnActive : {}) }}
                onClick={() => onLayerModeChange(l.id)}
              >
                <div style={{ ...styles.dot, background: l.color, opacity: layerMode === l.id ? 1 : 0.4 }} />
                {l.label}
              </button>
            ))}

            {/* Boundaries toggle */}
            <div style={styles.toggleRow}>
              <span style={styles.toggleLabel}>
                <div style={{ ...styles.dot, background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.3)' }} />
                State boundaries
              </span>
              <Toggle on={showBoundaries} onToggle={onBoundariesToggle} />
            </div>
          </div>
        </div>

        {/* States */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            <span>
              States{' '}
              {filters.states?.length > 0 && (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {filters.states.length} selected
                </span>
              )}
            </span>
            <div style={styles.labelActions}>
              {filteredStates.length > 0 && (
                allStatesSelected ? (
                  <button style={styles.clearBtn} onClick={() => clearAll('states', { osns: [] })}>
                    Deselect all
                  </button>
                ) : (
                  <button style={styles.selectAllBtn} onClick={() => selectAll('states', filteredStates)}>
                    Select all
                  </button>
                )
              )}
              {filters.states?.length > 0 && !allStatesSelected && (
                <button style={styles.clearBtn} onClick={() => clearAll('states', { osns: [] })}>
                  Clear
                </button>
              )}
            </div>
          </div>
          {optionsLoading ? (
            <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Loading states…</div>
          ) : (
            <>
              <input
                style={styles.searchBox}
                placeholder="Search states…"
                value={stateSearch}
                onChange={e => setStateSearch(e.target.value)}
              />
              <div style={styles.checkList}>
                {filteredStates.map(s => (
                  <CheckItem
                    key={s}
                    label={s}
                    checked={(filters.states || []).includes(s)}
                    onChange={() => toggle('states', s)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Originating System Names */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            <span>
              Originating System{' '}
              {filters.osns?.length > 0 && (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {filters.osns.length} sel.
                </span>
              )}
            </span>
            <div style={styles.labelActions}>
              {filteredOsns.length > 0 && (
                allOsnsSelected ? (
                  <button style={styles.clearBtn} onClick={() => clearAll('osns')}>
                    Deselect all
                  </button>
                ) : (
                  <button style={styles.selectAllBtn} onClick={() => selectAll('osns', filteredOsns)}>
                    Select all
                  </button>
                )
              )}
              {filters.osns?.length > 0 && !allOsnsSelected && (
                <button style={styles.clearBtn} onClick={() => clearAll('osns')}>
                  Clear
                </button>
              )}
            </div>
          </div>
          {options.osns?.length === 0 && filters.states?.length === 0 ? (
            <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Select a state first</div>
          ) : optionsLoading ? (
            <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Loading…</div>
          ) : (
            <>
              <input
                style={styles.searchBox}
                placeholder="Search OSN…"
                value={osnSearch}
                onChange={e => setOsnSearch(e.target.value)}
              />
              <div style={styles.checkList}>
                {filteredOsns.map(o => (
                  <CheckItem
                    key={o}
                    label={o}
                    checked={(filters.osns || []).includes(o)}
                    onChange={() => toggle('osns', o)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Standard Status */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            <span>Status</span>
            <div style={styles.labelActions}>
              {(options.statuses || []).length > 0 && (
                allStatusesSelected ? (
                  <button style={styles.clearBtn} onClick={() => clearAll('statuses')}>
                    Deselect all
                  </button>
                ) : (
                  <button style={styles.selectAllBtn} onClick={() => selectAll('statuses', options.statuses)}>
                    Select all
                  </button>
                )
              )}
              {filters.statuses?.length > 0 && !allStatusesSelected && (
                <button style={styles.clearBtn} onClick={() => clearAll('statuses')}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div style={styles.checkList}>
            {(options.statuses || []).map(s => (
              <CheckItem
                key={s}
                label={s}
                checked={(filters.statuses || []).includes(s)}
                onChange={() => toggle('statuses', s)}
              />
            ))}
          </div>
        </div>

        {/* Property Type */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            <span>Property Type</span>
            <div style={styles.labelActions}>
              {(options.propertyTypes || []).length > 0 && (
                allTypesSelected ? (
                  <button style={styles.clearBtn} onClick={() => clearAll('propertyTypes')}>
                    Deselect all
                  </button>
                ) : (
                  <button style={styles.selectAllBtn} onClick={() => selectAll('propertyTypes', options.propertyTypes)}>
                    Select all
                  </button>
                )
              )}
              {filters.propertyTypes?.length > 0 && !allTypesSelected && (
                <button style={styles.clearBtn} onClick={() => clearAll('propertyTypes')}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div style={styles.checkList}>
            {(options.propertyTypes || []).map(p => (
              <CheckItem
                key={p}
                label={p}
                checked={(filters.propertyTypes || []).includes(p)}
                onChange={() => toggle('propertyTypes', p)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <button
          style={{ ...styles.loadBtn, ...((!canLoad || loading) ? styles.loadBtnDisabled : {}) }}
          onClick={onLoad}
          disabled={!canLoad || loading}
        >
          {loading ? (
            <><span style={styles.spinner} />Loading data…</>
          ) : (
            '⟳  Load Map Data'
          )}
        </button>
        {!canLoad && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px', textAlign: 'center' }}>
            Select at least one state to scope the map
          </div>
        )}
        {canLoad && onForceRefresh && (
          <button
            style={styles.refreshBtn}
            onClick={onForceRefresh}
            disabled={loading}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.borderColor = 'var(--border2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            ↺ Bypass cache — re-query Snowflake
          </button>
        )}
      </div>
    </div>
  );
}
