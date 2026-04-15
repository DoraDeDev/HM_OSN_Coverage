// components/MapView.jsx — H3 hex bins or HeatmapLayer + react-map-gl
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { WebMercatorViewport, FlyToInterpolator } from '@deck.gl/core';
import Map, { NavigationControl, ScaleControl, Layer } from 'react-map-gl/mapbox';
import { cellToLatLng } from 'h3-js';
import 'mapbox-gl/dist/mapbox-gl.css';

import { lonLatMatchesStateSelection, unionBoundsForStates } from '../lib/usStateBounds';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

/** Match Sigma plugin: spectral ramp on light basemap */
const HEATMAP_COLOR_RANGE = [
  [200, 230, 255, 0],
  [120, 200, 255, 65],
  [40, 190, 255, 110],
  [0, 220, 200, 150],
  [60, 235, 120, 185],
  [180, 250, 80, 215],
  [255, 235, 60, 235],
  [255, 145, 30, 248],
  [215, 35, 40, 255],
];

const HEAT_RADIUS_PX = Math.max(5, parseInt(process.env.NEXT_PUBLIC_HEATMAP_RADIUS_PX || '80', 10));
const HEAT_INTENSITY = Math.max(0.1, parseFloat(process.env.NEXT_PUBLIC_HEATMAP_INTENSITY || '1.35'));
const MAP_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE || 'mapbox://styles/mapbox/light-v11';

/**
 * 0.1° bins are fixed in lon/lat; their on-screen spacing grows ~2^zoom.
 * If radiusPixels stays constant, zooming in kills overlap → separate “pearls”.
 * Scale radius with zoom (clamped) so neighbors still share weight and blend.
 */
function radiusPixelsForZoom(zoom) {
  const z = Number.isFinite(zoom) ? zoom : 5;
  const refZ = 5.25;
  const exp = Math.max(0, z - refZ) * 0.62;
  const scaled = HEAT_RADIUS_PX * Math.pow(2, exp);
  return Math.round(Math.max(24, Math.min(132, scaled)));
}

function intensityForZoom(zoom) {
  const z = Number.isFinite(zoom) ? zoom : 5;
  if (z <= 7) return HEAT_INTENSITY;
  if (z <= 9) return HEAT_INTENSITY * 0.92;
  return HEAT_INTENSITY * 0.82;
}

/** Spectral-style RGBA stops (skip first near-transparent for filled hex) */
const HEX_FILL_STOPS = HEATMAP_COLOR_RANGE.filter((_, i) => i !== 0);

/** Cool teal → yellow → orange (reads on Mapbox dark / similar basemaps) */
const HEX_ON_DARK_STOPS = [
  [18, 95, 120, 235],
  [10, 130, 145, 240],
  [0, 165, 150, 242],
  [45, 195, 115, 245],
  [130, 220, 70, 248],
  [230, 215, 50, 250],
  [255, 150, 40, 252],
  [240, 75, 35, 255],
  [220, 40, 30, 255],
];

const H3_HEX_FILL_OPACITY = Math.max(
  0.25,
  Math.min(1, parseFloat(process.env.NEXT_PUBLIC_H3_HEX_OPACITY || '0.68')),
);

function interpolateStops(stops, t) {
  const u = Math.max(0, Math.min(1, t));
  if (stops.length === 0) return [128, 128, 128, 0];
  if (stops.length === 1) return stops[0];
  const n = stops.length - 1;
  const x = u * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    Math.round(a[3] + (b[3] - a[3]) * f),
  ];
}

const NA = { minLat: 14, maxLat: 84, minLon: -180, maxLon: -50 };
function inNA(lon, lat) {
  return lat >= NA.minLat && lat <= NA.maxLat && lon >= NA.minLon && lon <= NA.maxLon;
}

const INITIAL_VIEW = {
  longitude: -98.5795,
  latitude: 39.8283,
  zoom: 4,
  pitch: 0,
  bearing: 0,
};

export default function MapView({
  data,
  aggregation = 'grid', // 'h3' | 'grid' | 'points'
  showBoundaries,
  selectedStates = [],
  onViewportChange,
}) {
  const containerRef = useRef(null);
  const onVpRef = useRef(onViewportChange);
  onVpRef.current = onViewportChange;

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [viewState, setViewState] = useState(INITIAL_VIEW);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const heatPoints = useMemo(() => {
    const pts = [];
    for (const row of data || []) {
      const lon = parseFloat(row.longitude);
      const lat = parseFloat(row.latitude);
      if (!isFinite(lon) || !isFinite(lat) || !inNA(lon, lat)) continue;
      if (!lonLatMatchesStateSelection(lon, lat, selectedStates, row.stateorprovince)) continue;
      pts.push({
        position: [lon, lat],
        weight: aggregation === 'points' ? 1 : (parseInt(row.listing_count, 10) || 1),
      });
    }
    return pts;
  }, [data, selectedStates, aggregation]);

  const hexRows = useMemo(() => {
    if (aggregation !== 'h3') return [];
    const out = [];
    for (const row of data || []) {
      const h = row.h3;
      if (!h || typeof h !== 'string') continue;
      let lat;
      let lon;
      try {
        [lat, lon] = cellToLatLng(h);
      } catch {
        continue;
      }
      if (!isFinite(lon) || !isFinite(lat) || !inNA(lon, lat)) continue;
      if (!lonLatMatchesStateSelection(lon, lat, selectedStates, row.stateorprovince)) continue;
      const listingCount = parseInt(row.listing_count, 10) || 0;
      out.push({ ...row, h3: h, listing_count: listingCount, _lat: lat, _lon: lon });
    }
    return out;
  }, [data, aggregation, selectedStates]);

  const hexStops = useMemo(
    () => (/dark/i.test(MAP_STYLE) ? HEX_ON_DARK_STOPS : HEX_FILL_STOPS),
    [],
  );

  const hexColorFn = useMemo(() => {
    const counts = hexRows.map((r) => r.listing_count).filter((c) => c > 0);
    if (counts.length === 0) return () => [200, 230, 255, 0];
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);
    const lo = Math.log1p(minC);
    const hi = Math.log1p(maxC);
    const span = hi - lo || 1;
    return (c) => {
      const t = (Math.log1p(Math.max(0, c)) - lo) / span;
      return interpolateStops(hexStops, t);
    };
  }, [hexRows, hexStops]);

  const hexColorScaleKey = useMemo(() => {
    if (hexRows.length === 0) return '0';
    const counts = hexRows.map((r) => r.listing_count);
    const palette = /dark/i.test(MAP_STYLE) ? 'dark' : 'light';
    return `${hexRows.length}:${Math.min(...counts)}:${Math.max(...counts)}:${palette}`;
  }, [hexRows]);

  const fitPositions = useMemo(() => {
    if (aggregation === 'h3' && hexRows.length > 0) {
      return hexRows.map((r) => [r._lon, r._lat]);
    }
    return heatPoints.map((p) => p.position);
  }, [aggregation, hexRows, heatPoints]);

  const zoomKey = Math.round((viewState.zoom ?? INITIAL_VIEW.zoom) * 4) / 4;

  const layers = useMemo(() => {
    if (aggregation === 'h3' && hexRows.length > 0) {
      return [
        new H3HexagonLayer({
          id: 'h3-listing-density',
          data: hexRows,
          getHexagon: (d) => d.h3,
          getFillColor: (d) => {
            const c = hexColorFn(d.listing_count);
            return [c[0], c[1], c[2], Math.round(c[3] * H3_HEX_FILL_OPACITY)];
          },
          stroked: false,
          extruded: false,
          pickable: false,
          updateTriggers: { getFillColor: hexColorScaleKey },
        }),
      ];
    }
    if (heatPoints.length === 0) return [];
    const z = zoomKey;
    return [
      new HeatmapLayer({
        id: aggregation === 'points' ? 'listing-points-heatmap' : 'listing-density',
        data: heatPoints,
        getPosition: (d) => d.position,
        getWeight: (d) => d.weight,
        radiusPixels: radiusPixelsForZoom(z),
        intensity: intensityForZoom(z),
        threshold: 0.008,
        colorRange: HEATMAP_COLOR_RANGE,
        debounceTimeout: 20,
        updateTriggers: {
          getWeight: heatPoints.length,
          radiusPixels: z,
        },
      }),
    ];
  }, [aggregation, hexRows, hexColorFn, hexColorScaleKey, heatPoints, zoomKey]);

  const fitToDataOrStates = useCallback(() => {
    const { w, h } = size;
    if (w < 32 || h < 32) return;

    const vp = new WebMercatorViewport({
      width: w,
      height: h,
      longitude: INITIAL_VIEW.longitude,
      latitude: INITIAL_VIEW.latitude,
      zoom: INITIAL_VIEW.zoom,
      pitch: 0,
      bearing: 0,
    });

    const maxZ = selectedStates.length === 1 ? 9 : 8;
    const maxZEmpty = selectedStates.length === 1 ? 8 : 7;

    if (fitPositions.length > 0) {
      const lons = fitPositions.map((p) => p[0]);
      const lats = fitPositions.map((p) => p[1]);
      const fitted = vp.fitBounds(
        [
          [Math.min(...lons) - 0.35, Math.min(...lats) - 0.35],
          [Math.max(...lons) + 0.35, Math.max(...lats) + 0.35],
        ],
        { padding: 56, maxZoom: maxZ }
      );
      setViewState({
        longitude: fitted.longitude,
        latitude: fitted.latitude,
        zoom: fitted.zoom,
        pitch: 0,
        bearing: 0,
        transitionDuration: 800,
        transitionInterpolator: new FlyToInterpolator(),
      });
      return;
    }

    const u = unionBoundsForStates(selectedStates);
    if (u) {
      const fitted = vp.fitBounds(
        [[u.minLon, u.minLat], [u.maxLon, u.maxLat]],
        { padding: 48, maxZoom: maxZEmpty }
      );
      setViewState({
        longitude: fitted.longitude,
        latitude: fitted.latitude,
        zoom: fitted.zoom,
        pitch: 0,
        bearing: 0,
        transitionDuration: 800,
        transitionInterpolator: new FlyToInterpolator(),
      });
    }
  }, [size, fitPositions, selectedStates]);

  useEffect(() => {
    fitToDataOrStates();
  }, [fitToDataOrStates]);

  const onViewStateChange = useCallback(({ viewState: vs }) => {
    const { transitionDuration, transitionInterpolator, ...rest } = vs;
    onVpRef.current?.({ zoom: rest.zoom });
    setViewState(rest);
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text3)',
          fontSize: 14,
        }}
      >
        Set NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  const deckW = size.w > 0 ? size.w : '100%';
  const deckH = size.h > 0 ? size.h : '100%';

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DeckGL
        width={deckW}
        height={deckH}
        layers={layers}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={{ dragRotate: false, touchRotate: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MAP_STYLE}
          reuseMaps
          projection="mercator"
          style={{ width: '100%', height: '100%' }}
          // Let DeckGL own interaction; Map stays in sync via context
          interactive={false}
        >
          <NavigationControl showCompass={false} position="bottom-right" />
          <ScaleControl position="bottom-left" />

          {showBoundaries && (
            <>
              <Layer
                id="state-borders-glow"
                type="line"
                source="composite"
                {...{ 'source-layer': 'admin' }}
                minzoom={2}
                filter={['all', ['==', ['get', 'admin_level'], 1], ['==', ['get', 'maritime'], 'false']]}
                paint={{
                  'line-color': 'rgba(0,80,180,0.08)',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 2, 3, 8, 8],
                  'line-blur': 5,
                }}
                layout={{ visibility: 'visible' }}
              />
              <Layer
                id="state-borders"
                type="line"
                source="composite"
                {...{ 'source-layer': 'admin' }}
                minzoom={2}
                filter={['all', ['==', ['get', 'admin_level'], 1], ['==', ['get', 'maritime'], 'false']]}
                paint={{
                  'line-color': 'rgba(60,60,80,0.55)',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 6, 1.2, 10, 2],
                  'line-dasharray': [2, 2],
                }}
                layout={{ visibility: 'visible' }}
              />
            </>
          )}
        </Map>
      </DeckGL>
    </div>
  );
}
