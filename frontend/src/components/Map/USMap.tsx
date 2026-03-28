import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { useStore } from '../../store/useStore';
import type { CountyRecord } from '../../types';

import CountyTooltip from './CountyTooltip';
import MapLegend from './MapLegend';
import CountyModal from '../Regional/CountyModal';

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json';

export default function USMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    counties, selectedMetric, mapMode, resultsByFips,
    setHoveredFips, setSelectedCounty, selectedCounty,
  } = useStore();

  const [topoData, setTopoData] = useState<object | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; county: CountyRecord | null; visible: boolean
  }>({ x: 0, y: 0, county: null, visible: false });
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });

  // Build county lookup map
  const countyByFips = useMemo(() => new Map(counties.map(c => [c.fips, c])), [counties]);

  // Keep a ref so D3 event handlers always read the latest map without needing re-render.
  // This prevents the stale-closure bug where hovering Utah showed Idaho data.
  const countyByFipsRef = useRef(countyByFips);
  useEffect(() => { countyByFipsRef.current = countyByFips; }, [countyByFips]);

  // Load TopoJSON
  useEffect(() => {
    d3.json(TOPO_URL).then(data => setTopoData(data as object)).catch(console.error);
  }, []);

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ w: width || 800, h: height || 500 });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Color scale
  const colorScale = useMemo(() => {
    if (mapMode === 'impact' && resultsByFips.size > 0) {
      const changes = Array.from(resultsByFips.values())
        .map(r => r.absoluteChange[selectedMetric] ?? 0);
      const extent = Math.max(Math.abs(d3.min(changes) ?? 0), Math.abs(d3.max(changes) ?? 0), 0.1);
      return d3.scaleDiverging<string>()
        .domain([-extent, 0, extent])
        .interpolator(d3.interpolateRgbBasis(
          selectedMetric === 'checkups'
            ? ['#FF6B6B', '#3D8EFF', '#00D4AA']
            : ['#00D4AA', '#3D8EFF', '#FF6B6B']
        ));
    }
    if (mapMode === 'vulnerability') {
      return d3.scaleSequential<string>()
        .domain([0, 1])
        .interpolator(d3.interpolateRgbBasis(['#0D1526', '#9B6FFF', '#FF6B6B']));
    }
    if (mapMode === 'equity') {
      return d3.scaleSequential<string>()
        .domain([0, 30])
        .interpolator(d3.interpolateRgbBasis(['#00D4AA', '#FFB84D', '#FF6B6B']));
    }
    const values = counties.map(c => (c.health as Record<string, number>)[selectedMetric]).filter(Boolean);
    const [lo, hi] = d3.extent(values) as [number, number];
    const isPositiveMetric = selectedMetric === 'checkups';
    return d3.scaleSequential<string>()
      .domain([lo, hi])
      .interpolator(isPositiveMetric
        ? d3.interpolateRgbBasis(['#FF6B6B', '#FFB84D', '#00D4AA'])
        : d3.interpolateRgbBasis(['#00D4AA', '#FFB84D', '#FF6B6B'])
      );
  }, [counties, selectedMetric, mapMode, resultsByFips]);

  const getCountyColor = useCallback((fips: string): string => {
    const county = countyByFips.get(fips);
    if (!county) return '#131D33';

    if (mapMode === 'impact') {
      const result = resultsByFips.get(fips);
      if (!result) return '#131D33';
      const change = result.absoluteChange[selectedMetric] ?? 0;
      return (colorScale as d3.ScaleDiverging<string, never>)(change);
    }
    if (mapMode === 'vulnerability') {
      return (colorScale as d3.ScaleSequential<string, never>)(county.svi.overall);
    }
    if (mapMode === 'equity') {
      return (colorScale as d3.ScaleSequential<string, never>)(county.demographics.pctPoverty);
    }
    const val = (county.health as Record<string, number>)[selectedMetric] ?? 0;
    return (colorScale as d3.ScaleSequential<string, never>)(val);
  }, [countyByFips, selectedMetric, mapMode, resultsByFips, colorScale]);

  // Render D3 map — only re-runs when topo/dimensions change, NOT on data updates
  useEffect(() => {
    if (!topoData || !svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { w, h } = dimensions;

    // Account for floating panels: Left (320px + 88px offset = 408), Right (340px + 16px offset = 356)
    const leftOffset = 408;
    const rightOffset = 356;
    const safeW = Math.max(400, w - leftOffset - rightOffset); // The visible center area
    
    // Scale strictly to fit the 100% visible safe zone
    const scaleX = safeW / 975;
    const scaleY = h / 610;
    const scale = Math.min(scaleX, scaleY) * 0.95; // 5% padding inside safe area
    
    // Center it strictly inside the safe area
    const tx = leftOffset + (safeW - 975 * scale) / 2;
    const ty = (h - 610 * scale) / 2;

    const zoomContainer = svg.append('g').attr('class', 'zoom-layer');
    const renderLayer = zoomContainer.append('g').attr('transform', `translate(${tx},${ty}) scale(${scale})`);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .translateExtent([[-w * 0.5, -h * 0.5], [w * 1.5, h * 1.5]]) // Loosen pan bounds
      .on('zoom', (event) => {
        zoomContainer.attr('transform', event.transform);
      });

    svg.call(zoom);

    const path = d3.geoPath(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const us = topoData as any;

    // Draw counties
    renderLayer.selectAll<SVGPathElement, GeoJSON.Feature>('.county-path')
      .data((topojson.feature(us, us.objects.counties) as unknown as GeoJSON.FeatureCollection).features)
      .enter()
      .append('path')
      .attr('class', 'county-path')
      .attr('d', d => path(d as GeoJSON.Feature) || '')
      .attr('fill', d => getCountyColor(String(d.id).padStart(5, '0')))
      .on('mousemove', function (event, d) {
        d3.select(this).raise(); // Bring hovered county to the top so its thick border isn't clipped
        const fips = String(d.id).padStart(5, '0');
        // Read from ref so this always reflects the latest loaded county data
        const county = countyByFipsRef.current.get(fips) ?? null;
        setHoveredFips(fips);
        // Use container-relative coords to avoid viewport drift issues
        const rect = containerRef.current!.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, county, visible: true });
      })
      .on('mouseleave', function () {
        setHoveredFips(null);
        setTooltip(t => ({ ...t, visible: false }));
      })
      .on('click', (_, d) => {
        const fips = String(d.id).padStart(5, '0');
        const county = countyByFipsRef.current.get(fips) ?? null;
        if (county) setSelectedCounty(county);
      });

    // State borders mesh
    renderLayer.append('path')
      .datum(topojson.mesh(us, us.objects.states, (a, b) => a !== b))
      .attr('class', 'state-mesh')
      .attr('d', path);

  // Deliberately omit countyByFipsRef from deps — it's a ref, always current
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topoData, dimensions, getCountyColor, setHoveredFips, setSelectedCounty]);

  // Update county colors without full re-render
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGPathElement, GeoJSON.Feature>('.county-path')
      .attr('fill', d => getCountyColor(String(d.id).padStart(5, '0')));
  }, [getCountyColor]);

  return (
    <div ref={containerRef} className="map-container" style={{ position: 'relative' }}>
      {counties.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, color: 'var(--text-dim)'
        }}>
          <div className="spinner" />
          <span style={{ fontSize: 13 }}>Loading county data…</span>
        </div>
      )}

      <svg ref={svgRef} className="map-svg" />

      {tooltip.visible && tooltip.county && (
        <CountyTooltip
          x={tooltip.x}
          y={tooltip.y}
          county={tooltip.county}
          selectedMetric={selectedMetric}
          mapMode={mapMode}
          resultsByFips={resultsByFips}
        />
      )}

      <MapLegend colorScale={colorScale} selectedMetric={selectedMetric} mapMode={mapMode} />

      {selectedCounty && (
        <CountyModal
          county={selectedCounty}
          onClose={() => setSelectedCounty(null)}
          resultsByFips={resultsByFips}
        />
      )}
    </div>
  );
}
