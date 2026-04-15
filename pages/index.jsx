// pages/index.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import FilterPanel from '../components/FilterPanel';
import Legend from '../components/Legend';
import ListingPopup from '../components/ListingPopup';
import CoverageTable from '../components/CoverageTable';
import { ZOOM_PRECISION, h3ResolutionForZoom, ZOOM_H3_MAX_ZOOM } from '../lib/tiles';

const PREFER_H3 = process.env.NEXT_PUBLIC_HEATMAP_USE_H3 !== 'false';

// Dynamically load MapView to avoid SSR issues with mapbox-gl
const MapView = dynamic(() => import('../components/MapView'), { ssr: false });

const styles = {
  layout: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  mapArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  toast: {
    position: 'absolute',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(20,23,32,0.95)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '10px 18px',
    color: 'var(--text)',
    fontSize: '13px',
    zIndex: 100,
    animation: 'fadeIn 0.2s ease',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  toastError: {
    borderColor: 'rgba(248,113,113,0.3)',
    color: '#f87171',
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(13,15,20,0.6)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    gap: '12px',
  },
  loadingCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '24px 32px',
    textAlign: 'center',
  },
  loadingSpinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 12px',
  },
  loadingText: { color: 'var(--text2)', fontSize: '14px' },
  loadingSubtext: { color: 'var(--text3)', fontSize: '12px', marginTop: '4px' },
  coverageToggle: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    zIndex: 10,
  },
  coverageBtn: {
    background: 'rgba(20,23,32,0.9)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '8px 14px',
    color: 'var(--text2)',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'var(--font)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.15s',
  },
  popupOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 30,
    pointerEvents: 'none',
  },
  popupContainer: {
    position: 'absolute',
    pointerEvents: 'all',
    background: 'var(--surface)',
    border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    animation: 'fadeIn 0.15s ease',
  },
};

export default function Home() {
  const [filters, setFilters] = useState({
    states: [],
    osns: [],
    statuses: [],
    propertyTypes: [],
  });
  const [mapZoom, setMapZoom] = useState(5);
  const [options, setOptions] = useState({
    states: [],
    osns: [],
    statuses: [],
    propertyTypes: [],
  });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [data, setData] = useState([]);
  const [coverageData, setCoverageData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [layerMode, setLayerMode] = useState('heatmap');
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [popup, setPopup] = useState(null);
  const [showCoverageTable, setShowCoverageTable] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const loadedPrecisionRef = useRef(null);
  const prevLayerModeRef = useRef(null);
  const loadDataRef = useRef(null);
  const [heatmapMeta, setHeatmapMeta] = useState({ aggregation: PREFER_H3 ? 'h3' : 'grid', h3Resolution: null });

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Load initial filter options
  useEffect(() => {
    (async () => {
      setOptionsLoading(true);
      try {
        const res = await fetch('/api/filters?type=all');
        const json = await res.json();
        if (json.success) {
          setOptions(prev => ({
            ...prev,
            states: json.states || [],
            statuses: json.statuses || [],
            propertyTypes: json.propertyTypes || [],
          }));
        }
      } catch (e) {
        showToast('Failed to load filter options', 'error');
      } finally {
        setOptionsLoading(false);
      }
    })();
  }, []);

  // Load OSNs when state / status / property slice changes (only MLS with rows in that slice)
  useEffect(() => {
    if (filters.states.length === 0) {
      setOptions(prev => ({ ...prev, osns: [] }));
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/filters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'osns',
            states: filters.states,
            statuses: filters.statuses,
            propertyTypes: filters.propertyTypes,
          }),
        });
        const json = await res.json();
        if (json.success) {
          setOptions(prev => ({ ...prev, osns: json.data || [] }));
        }
      } catch {}
    })();
  }, [filters.states, filters.statuses, filters.propertyTypes]);

  useEffect(() => {
    setFilters((prev) => {
      if (prev.states.length === 0 || prev.osns.length === 0) return prev;
      if (!options.osns || options.osns.length === 0) return prev;
      const nextOsns = prev.osns.filter((o) => options.osns.includes(o));
      if (nextOsns.length === prev.osns.length) return prev;
      return { ...prev, osns: nextOsns };
    });
  }, [options.osns]);

  useEffect(() => {
    loadedPrecisionRef.current = null;
    prevLayerModeRef.current = null;
  }, [filters.states, filters.osns]);

  useEffect(() => {
    loadedPrecisionRef.current = null;
  }, [filters.statuses, filters.propertyTypes]);

  const handleMapViewportChange = useCallback(({ zoom }) => {
    const raw = Number(zoom);
    if (!Number.isFinite(raw)) return;
    const clamped = Math.min(ZOOM_H3_MAX_ZOOM, Math.max(0, raw));
    const stepped = Math.round(clamped * 4) / 4;
    setMapZoom((prev) => (Math.abs(prev - stepped) < 1e-6 ? prev : stepped));
  }, []);

  const loadData = useCallback(async (forceRefresh = false) => {
    if (filters.states.length === 0) {
      showToast('Select at least one state to load the heatmap', 'error');
      return;
    }

    setLoading(true);
    setPopup(null);

    try {
      const [heatmapRes, coverageRes] = await Promise.all([
        fetch('/api/heatmap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...filters,
            zoom: mapZoom,
            forceRefresh,
            visualization: layerMode === 'listingHeatmap' ? 'points' : 'bins',
          }),
        }),
        filters.states.length > 0 ? fetch('/api/coverage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            states: filters.states,
            osns: filters.osns,
            statuses: filters.statuses,
            propertyTypes: filters.propertyTypes,
            forceRefresh,
          }),
        }) : Promise.resolve(null),
      ]);

      const fromCache = heatmapRes.headers.get('X-Cache') === 'HIT';
      const heatmapJson = await heatmapRes.json();

      if (!heatmapJson.success) throw new Error(heatmapJson.error || 'Failed to load data');

      setData(heatmapJson.data || []);
      loadedPrecisionRef.current =
        heatmapJson.requestedResolutionKey
        ?? heatmapJson.resolutionKey
        ?? (heatmapJson.aggregation === 'h3' && heatmapJson.h3Resolution != null
          ? `h3:${heatmapJson.h3Resolution}`
          : `grid:${heatmapJson.precision ?? 2}`);

      const agg = heatmapJson.aggregation;
      setHeatmapMeta({
        aggregation: agg === 'h3' ? 'h3' : agg === 'points' ? 'points' : 'grid',
        h3Resolution: heatmapJson.h3Resolution ?? null,
      });

      if (coverageRes) {
        const coverageJson = await coverageRes.json();
        if (coverageJson.success) setCoverageData(coverageJson.data || []);
      }

      const count = heatmapJson.count || 0;
      const precision = heatmapJson.precision || 2;
      const precisionLabel = { 1: '~110km', 2: '~55km', 3: '~22km', 4: '~11km', 5: '~5km' }[precision] || '';
      const h3ResToast = heatmapJson.h3Resolution;
      const binLabel = heatmapJson.aggregation === 'points'
        ? `listings sample (cap ${(heatmapJson.pointSampleLimit ?? 0).toLocaleString()})`
        : heatmapJson.aggregation === 'h3' && h3ResToast != null
          ? `H3 res ${h3ResToast}`
          : `${precisionLabel} grid`;
      const fallbackNote = heatmapJson.h3Fallback ? ' (H3 unavailable — grid)' : '';

      showToast(
        fromCache
          ? `⚡ ${count.toLocaleString()} cells from cache (${binLabel})${fallbackNote}`
          : `◎ ${count.toLocaleString()} cells from Snowflake (${binLabel})${fallbackNote}`
      );
    } catch (err) {
      showToast(err.message || 'Failed to load map data', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, mapZoom, showToast, layerMode]);

  loadDataRef.current = loadData;

  useEffect(() => {
    if (filters.states.length === 0) return;
    const t = setTimeout(() => {
      loadDataRef.current?.(false);
    }, 400);
    return () => clearTimeout(t);
  }, [filters.statuses, filters.propertyTypes]);

  useEffect(() => {
    if (filters.states.length === 0) return;
    if (prevLayerModeRef.current === null) {
      prevLayerModeRef.current = layerMode;
      return;
    }
    if (prevLayerModeRef.current === layerMode) return;
    prevLayerModeRef.current = layerMode;
    loadedPrecisionRef.current = null;
    loadData(false);
  }, [layerMode, loadData, filters.states.length]);

  useEffect(() => {
    if (filters.states.length === 0) return;
    if (loadedPrecisionRef.current === null) return;
    if (layerMode === 'listingHeatmap') return;
    const z = Math.min(15, Math.max(0, Math.floor(mapZoom)));
    const want = PREFER_H3
      ? `h3:${h3ResolutionForZoom(mapZoom)}`
      : `grid:${ZOOM_PRECISION[z] ?? 2}`;
    if (want === loadedPrecisionRef.current) return;
    const t = setTimeout(() => {
      const zz = Math.min(15, Math.max(0, Math.floor(mapZoom)));
      const still = PREFER_H3
        ? `h3:${h3ResolutionForZoom(mapZoom)}`
        : `grid:${ZOOM_PRECISION[zz] ?? 2}`;
      if (still === loadedPrecisionRef.current) return;
      loadData(false);
    }, 450);
    return () => clearTimeout(t);
  }, [mapZoom, filters.states.length, loadData, layerMode]);

  const dataStats = data.length > 0 ? {
    totalListings: heatmapMeta.aggregation === 'points'
      ? data.length
      : data.reduce((sum, r) => sum + (parseInt(r.listing_count, 10) || 0), 0),
    mapCells: heatmapMeta.aggregation === 'points' ? null : data.length,
    stateCount: new Set(data.map(r => r.stateorprovince).filter(Boolean)).size,
    osnCount: new Set(data.map(r => r.originatingsystemname).filter(Boolean)).size,
  } : null;

  const handlePointClick = useCallback((properties, lngLat) => {
    setPopup({ properties, lngLat });
  }, []);

  // Handle layer mode change
  const handleLayerMode = (mode) => {
    setLayerMode(mode);
    if (mode === 'coverage' && coverageData.length > 0) {
      setShowCoverageTable(true);
    }
  };

  return (
    <div style={styles.layout}>
      {/* Left filter panel */}
      <FilterPanel
        filters={filters}
        onFiltersChange={setFilters}
        onLoad={() => loadData(false)}
        onForceRefresh={() => loadData(true)}
        loading={loading}
        options={options}
        optionsLoading={optionsLoading}
        dataStats={dataStats}
        eligibleOsnCount={filters.states.length > 0 ? options.osns.length : null}
        layerMode={layerMode}
        onLayerModeChange={handleLayerMode}
        showBoundaries={showBoundaries}
        onBoundariesToggle={() => setShowBoundaries(b => !b)}
      />

      {/* Map area */}
      <div style={styles.mapArea}>
        <MapView
          data={data}
          aggregation={heatmapMeta.aggregation}
          showBoundaries={showBoundaries}
          selectedStates={filters.states}
          onViewportChange={handleMapViewportChange}
        />

        {/* Loading overlay */}
        {loading && (
          <div style={styles.loadingOverlay}>
            <div style={styles.loadingCard}>
              <div style={styles.loadingSpinner} />
              <div style={styles.loadingText}>Querying Snowflake…</div>
              <div style={styles.loadingSubtext}>
                {filters.states.length > 0 ? `States: ${filters.states.join(', ')}` : 'Loading all data'}
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ ...styles.toast, ...(toast.type === 'error' ? styles.toastError : {}) }}>
            {toast.message}
          </div>
        )}

        {/* Legend */}
        <Legend layerMode={layerMode} data={data} activeStatuses={filters.statuses} />

        {/* Coverage table */}
        {showCoverageTable && coverageData.length > 0 && (
          <CoverageTable
            data={coverageData}
            onClose={() => setShowCoverageTable(false)}
            selectedStates={filters.states}
          />
        )}

        {/* Coverage table toggle button */}
        {!showCoverageTable && coverageData.length > 0 && (
          <div style={styles.coverageToggle}>
            <button
              style={styles.coverageBtn}
              onClick={() => setShowCoverageTable(true)}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
            >
              <span>◈</span> OSN Coverage Table
            </button>
          </div>
        )}

        {/* Popup for clicked listing */}
        {popup && (
          <div style={styles.popupOverlay}>
            <div
              style={{
                ...styles.popupContainer,
                left: `${Math.min(popup.lngLat?.x || 300, window.innerWidth - 320)}px`,
                top: `${Math.min(popup.lngLat?.y || 200, window.innerHeight - 300)}px`,
              }}
            >
              <button
                onClick={() => setPopup(null)}
                style={{
                  position: 'absolute', top: '8px', right: '10px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text3)', fontSize: '16px', fontFamily: 'var(--font)', zIndex: 1,
                }}
              >×</button>
              <ListingPopup properties={popup.properties} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && data.length === 0 && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.3 }}>◈</div>
              <div style={{ fontSize: '14px', marginBottom: '4px', color: 'var(--text2)' }}>Select filters and load data</div>
              <div style={{ fontSize: '12px' }}>Choose one or more states, then optionally narrow by OSN</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
