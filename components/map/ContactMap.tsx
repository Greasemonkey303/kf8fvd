"use client"

import React, { useEffect, useRef, useState } from 'react'

type Geo = { lat: number; lon: number };

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if ((window as any).L) return res();
    const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(); s.onerror = rej; document.body.appendChild(s);
  });
}

function parseAdif(txt: string) {
  try {
    const body = txt.replace(/\r/g,'\n').split(/<EOR>|<eor>/).map(s=>s.trim()).filter(Boolean);
    const entries: any[] = [];
    for (const rec of body) {
      const e: any = {};
      const matches = rec.match(/<([^:>]+)(?::(\d+))?>\s*([^<]*)/g) || [];
      for (const m of matches) {
        const mm = m.match(/<([^:>]+)(?::(\d+))?>\s*([^<]*)/);
        if (!mm) continue;
        const key = mm[1].toUpperCase(); const val = mm[3].trim();
        if (key === 'CALL') e.call = val;
        else if (key === 'QSO_DATE' || key === 'DATE') e.qso_date = val;
        else if (key === 'TIME_ON' || key === 'TIME') e.time = val;
        else if (key === 'BAND') e.band = val;
        else if (key === 'MODE') e.mode = val;
        else if (key === 'QTH') e.qth = val;
        else if (key === 'CITY') e.city = val;
        else if (key === 'STATE') e.state = val;
        else if (key === 'COUNTRY') e.country = val;
        else if (key === 'LAT' || key === 'LATITUDE') e.lat = val;
        else if (key === 'LON' || key === 'LONGITUDE') e.lon = val;
        else e[key.toLowerCase()] = val;
      }
      if (Object.keys(e).length>0) entries.push(e);
    }
    return entries;
  } catch(e) { return [] }
}

export default function ContactMap(){
  const ref = useRef<HTMLDivElement|null>(null);
  const mapRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [days, setDays] = useState(0); // 0 = all time

  const entriesRef = useRef<any[]>([]);
  const locationsRef = useRef<Record<string, any[]>>({});
  const resultsRef = useRef<Record<string,Geo|null>>({});
  const markersLayerRef = useRef<any|null>(null);
  const heatLayerRef = useRef<any|null>(null);
  const LRef = useRef<any|null>(null);
  const [showSliderPanel, setShowSliderPanel] = useState(false);
  const [showLegendPanel, setShowLegendPanel] = useState(false);
  const [modeFilters, setModeFilters] = useState<{[k:string]:boolean}>({ FM:true, DSTAR:true, DMR:true, OTHER:true });
  const [isMobile, setIsMobile] = useState(false);

  function getCssVar(name: string, fallback = '') {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch(e) { return fallback; }
  }

  useEffect(()=>{
    let mounted = true;
    const onResize = ()=> setIsMobile(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
    onResize();
    window.addEventListener('resize', onResize);
    loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js').then(async ()=>{
      if (!mounted) return;
      const L = (window as any).L;
      LRef.current = L;
      if (!ref.current) return;
      mapRef.current = L.map(ref.current, { center:[20,0], zoom:2, minZoom:2 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(mapRef.current);

      setStatus('Loading ADIF...');
      let entries: any[] = [];
      try {
        const r = await fetch('/logbook.adi');
        if (r.ok) { const txt = await r.text(); entries = parseAdif(txt); }
      } catch(e) { entries = []; }

      if (!entries || entries.length === 0) {
        setStatus('Loading server logbook...');
        try { const r = await fetch('/api/logbook'); const j = await r.json(); entries = Array.isArray(j.entries) ? j.entries : []; } catch(e) { entries = []; }
      }

      entriesRef.current = entries;
      setStatus(`Found ${entries.length} entries`);

      // group by location string
      const locations: Record<string, any[]> = {};
      entries.forEach((e:any)=>{
        const loc = (e.city || e.qth || '').trim() || ((e.state||'') + (e.country?(', '+e.country):'')).trim();
        if (!loc) return; const k = loc.trim(); if (!locations[k]) locations[k]=[]; locations[k].push(e);
      });
      locationsRef.current = locations;

      const keys = Object.keys(locations);
      if (keys.length === 0) { setStatus('No locations'); setLoading(false); return; }
      setStatus(`Geocoding ${keys.length} locations`);

      // Use browser localStorage cache for geocode results to avoid re-querying server
      const storageKey = 'kf8fvd-geocode-cache-v1';
      let cached: Record<string,Geo|null> = {};
      try { cached = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch(e) { cached = {}; }
      const toLookup = keys.filter(k => !cached || !Object.prototype.hasOwnProperty.call(cached, k));
      let results: Record<string,Geo|null> = { ...(cached || {}) };
      if (toLookup.length > 0) {
        try {
          const resp = await fetch('/api/geocode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ locations: toLookup }) });
          const j = await resp.json(); const newRes = j.results || {};
          results = { ...results, ...newRes };
          try { localStorage.setItem(storageKey, JSON.stringify(results)); } catch(e) { /* ignore quota errors */ }
        } catch(e) { /* network error: keep cached results only */ }
      }
      resultsRef.current = results;

      // preload markercluster and heat plugins (optional)
      try { await loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'); loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css'); loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css'); } catch(e) {}
      try { await loadScript('https://unpkg.com/leaflet.heat/dist/leaflet-heat.js'); } catch(e) {}

      // legend will be rendered by React (collapsed by default)

      // initial render of markers
      renderMarkers(days);

      setStatus(''); setLoading(false);
    }).catch(()=> setLoading(false));

    return ()=>{ mounted = false; window.removeEventListener('resize', onResize); }
  }, []);

    // helper: parse ADIF/ISO-ish date strings (YYYYMMDD or YYYY-MM-DD)
    function parseDateString(s?: string) {
      if (!s) return null;
      const t = s.trim();
      if (/^\d{8}$/.test(t)) {
        const y = +t.slice(0,4); const m = +t.slice(4,6); const d = +t.slice(6,8);
        return new Date(Date.UTC(y,m-1,d));
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
      return new Date(t);
    }

    function withinDays(entry:any, days:number) {
      if (!days || days<=0) return true;
      const dStr = entry.qso_date || entry.date || entry.qsoDate || entry.DATE || entry.QSO_DATE;
      const dt = parseDateString(dStr);
      if (!dt || isNaN(dt.getTime())) return false;
      const cutoff = Date.now() - (days*24*3600*1000);
      return dt.getTime() >= cutoff;
    }

    function entryModeCategory(mode?:string) {
      if (!mode) return 'OTHER';
      const m = mode.toString().toUpperCase();
      if (m.includes('FM')) return 'FM';
      if (m.includes('DSTAR')) return 'DSTAR';
      if (m.includes('DMR')) return 'DMR';
      return 'OTHER';
    }

    // renderMarkers reads from refs and updates marker & heat layers according to `days`
    function renderMarkers(daysFilter:number) {
      const L = LRef.current;
      if (!L || !mapRef.current) return;

      // clear old layers
      try {
        if (markersLayerRef.current) { mapRef.current.removeLayer(markersLayerRef.current); markersLayerRef.current = null; }
        if (heatLayerRef.current) { mapRef.current.removeLayer(heatLayerRef.current); heatLayerRef.current = null; }
      } catch(e){}

      const locations = locationsRef.current || {};
      const results = resultsRef.current || {};
      const keys = Object.keys(locations);
      const markers = (window as any).L.markerClusterGroup ? (window as any).L.markerClusterGroup() : null;
      const heatPoints: Array<[number,number,number]> = [];

      for (let i=0;i<keys.length;i++){
        const k = keys[i]; const g = results[k]; if (!g) continue;
        const groupEntries = locations[k] || [];
        // apply days filter: include location if any entry at that location is within range
        const include = groupEntries.some((en:any)=> {
          if (!withinDays(en, daysFilter)) return false;
          const cat = entryModeCategory(en.mode);
          if (cat === 'DMR') return modeFilters.DMR;
          if (cat === 'DSTAR') return modeFilters.DSTAR;
          if (cat === 'FM') return modeFilters.FM;
          return modeFilters.OTHER;
        });
        if (!include) continue;
        const modes = Array.from(new Set(groupEntries.map((x:any)=> (x.mode||'').toString()))).filter(Boolean);
        const fm = getCssVar('--color-success', '#16a34a');
        const dstar = getCssVar('--color-accent-1', '#60a5fa');
        const otherCol = getCssVar('--color-other', '#94a3b8');
        const color = modes.map(m=>m.toUpperCase()).includes('FM') ? fm : (modes.map(m=>m.toUpperCase()).includes('DSTAR') ? dstar : otherCol);
        const m = L.circleMarker([g.lat, g.lon], { radius:8, color: getCssVar('--white-100','#fff'), weight:1, fillColor: color, fillOpacity:0.95 });
        const popup = `<div><strong>${k}</strong><br/>${groupEntries.slice(0,6).map((x:any)=>x.call||'').join(', ')}<br/><small>modes: ${modes.join(', ')}</small></div>`;
        m.bindPopup(popup);
        // tooltip on hover with callsign(s) and location
        try {
          const calls = groupEntries.map((x:any)=> x.call || '').filter(Boolean).slice(0,6).join(', ');
          const tooltip = `${calls || 'Unknown'} — ${k}`;
          m.bindTooltip(tooltip, { direction: 'top', offset: [0, -8] });
        } catch(e) {}
        if (markers) markers.addLayer(m); else m.addTo(mapRef.current);
        heatPoints.push([g.lat, g.lon, Math.min(8, groupEntries.length || 1)]);
      }

      if (markers) { markersLayerRef.current = markers; mapRef.current.addLayer(markers); }

      if (heatPoints.length>0 && (window as any).L.heatLayer) {
        try { heatLayerRef.current = (window as any).L.heatLayer(heatPoints, { radius:25, blur:15, maxZoom:9, max:10 }); heatLayerRef.current.addTo(mapRef.current); } catch(e){}
      }
    }

    // re-render markers when days or mode filters change
    useEffect(()=>{ renderMarkers(days); }, [days, modeFilters]);

  return (
    <div className="map-wrap">
      <div ref={ref} className="map-ref" />

      {/* Collapsed controls: filter button (top-right) and legend button (bottom-right) */}
      <button aria-label="Open filters" onClick={()=> setShowSliderPanel(true)} className="panel-btn-top-right btn-ghost">Filters</button>

      {showSliderPanel && (
        <>
        <div onClick={()=> { if (isMobile) { setShowSliderPanel(false) } }} className="panel-backdrop" />
        <div role="dialog" aria-label="Filter panel" className={`panel-dialog ${isMobile ? 'panel-dialog-full' : 'panel-dialog-top'}`}>
          <div className="flex justify-between items-center mb-8">
            <div className="fw-800">Filters</div>
            <button aria-label="Close filters" onClick={()=> setShowSliderPanel(false)} className="btn-ghost fs-16">✕</button>
          </div>

            <div className="mb-8">
            <input aria-label="Days back" type="range" min={0} max={365} value={days} onChange={(e)=> setDays(Number((e.target as HTMLInputElement).value))} className="full-width" />
            <div className="flex justify-between items-center mt-6">
              <div className="fs-13">{days===0? 'All time' : `Last ${days} days`}</div>
              <div className="flex gap-6 flex-wrap">
                <button onClick={()=> setDays(7)} className="btn-ghost btn-ghost-sm">7d</button>
                <button onClick={()=> setDays(30)} className="btn-ghost btn-ghost-sm">30d</button>
                <button onClick={()=> setDays(90)} className="btn-ghost btn-ghost-sm">90d</button>
                <button onClick={()=> setDays(365)} className="btn-ghost btn-ghost-sm">365d</button>
                <button onClick={()=> setDays(0)} className="btn-ghost btn-ghost-sm">All</button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap gap-8">
              {['FM','DSTAR','DMR','OTHER'].map(m=> (
                <label key={m} className="label-pad flex items-center gap-8">
                  <input type="checkbox" checked={!!modeFilters[m]} onChange={()=> setModeFilters(prev=> ({ ...prev, [m]: !prev[m] }))} />
                  <span className="fs-13">{m}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        </>
      )}

      <button aria-label="Open legend" onClick={()=> setShowLegendPanel(true)} className="panel-btn-bottom-right btn-ghost">Key</button>

      {showLegendPanel && (
        <>
        <div onClick={()=> { if (isMobile) setShowLegendPanel(false) }} className="panel-backdrop" />
        <div role="dialog" aria-label="Legend" className={`panel-dialog ${isMobile ? 'panel-dialog-full' : 'panel-dialog-bottom'}`}>
          <div className="flex justify-between items-center mb-8">
            <div className="fw-800">Modes</div>
            <button aria-label="Close legend" onClick={()=> setShowLegendPanel(false)} className="btn-ghost fs-16">✕</button>
          </div>
          <div className="flex flex-col gap-12">
            <div className="legend-row"><span className="legend-swatch legend-swatch--success" aria-hidden></span><div className="fs-16">FM</div></div>
            <div className="legend-row"><span className="legend-swatch legend-swatch--dstar" aria-hidden></span><div className="fs-16">DSTAR</div></div>
            <div className="legend-row"><span className="legend-swatch legend-swatch--other" aria-hidden></span><div className="fs-16">DMR / Other</div></div>
          </div>
        </div>
        </>
      )}

      {loading && (
        <div className="map-status">{status || 'Loading map…'}</div>
      )}
    </div>
  )
}

