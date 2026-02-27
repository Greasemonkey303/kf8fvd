"use client"

import React, { useEffect, useRef, useState } from 'react'

type Geo = { lat: number; lon: number };

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if ((window as any).L) return res();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = () => res(); s.onerror = rej; document.body.appendChild(s);
  });
}

async function geocodeOnce(q: string): Promise<Geo | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'kf8fvd-dashboard/1.0 (contact)' } });
    if (!r.ok) return null;
    const js = await r.json();
    if (!Array.isArray(js) || js.length === 0) return null;
    return { lat: parseFloat(js[0].lat), lon: parseFloat(js[0].lon) };
  } catch (e) {
    return null;
  }
}

export default function ContactMap() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{done:number; total:number}>({done:0,total:0});
  const [finished, setFinished] = useState(false);
  const [entriesAll, setEntriesAll] = useState<any[]>([]);
  const [locationsMap, setLocationsMap] = useState<Record<string, any[]>>({});
  const [geocodeResults, setGeocodeResults] = useState<Record<string, { lat:number; lon:number } | null>>({});
  const markersLayerRef = useRef<any | null>(null);
  const heatLayerRef = useRef<any | null>(null);
  const [daysBack, setDaysBack] = useState<number>(365);
  const [modeFilters, setModeFilters] = useState<Record<string, boolean>>({});
  const [showControls, setShowControls] = useState<boolean>(false);
  const [showLegend, setShowLegend] = useState<boolean>(false);

  const LEGEND_COLORS: Record<string,string> = {
    FM: '#16a34a',
    DSTAR: '#60a5fa',
    DIGITALVOICE: '#a78bfa',
    DMR: '#f97316',
    OTHER: '#94a3b8'
  };

  useEffect(() => {
    loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js').then(async () => {
      const L = (window as any).L;
      if (!ref.current) return;
      mapRef.current = L.map(ref.current, { center: [20, 0], zoom: 2, minZoom: 2 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapRef.current);

      // fetch logbook entries and geocode locations
      try {
        const res = await fetch('/api/logbook');
        const j = await res.json();
        const entries = Array.isArray(j.entries) ? j.entries : [];
        const locations: Record<string, any[]> = {};
        entries.forEach((e: any) => {
          const loc = (e.city || e.qth || '').trim() || ((e.state || '') + (e.country ? (', ' + e.country) : '')).trim();
          if (!loc) return;
          const key = loc.trim();
          if (!locations[key]) locations[key] = [];
          locations[key].push(e);
        });

        const keys = Object.keys(locations);
        setProgress({done:0,total:keys.length});

        // request server-side geocoding for all unique keys
        const geocodeResp = await fetch('/api/geocode', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: keys })
        }).then(r => r.json()).catch(() => ({ ok: false, results: {} }));

        const results: Record<string, { lat:number; lon:number } | null> = geocodeResp.results || {};
        // store for reactive rendering
        setEntriesAll(entries);
        setLocationsMap(locations);
        setGeocodeResults(results);

        // initialize mode filters from entries
        try {
          const modes = Array.from(new Set(entries.map((x:any)=> (x.mode||'').toString().toUpperCase()).filter(Boolean)));
          const mf: Record<string, boolean> = {};
          modes.forEach(m=> mf[m]=true);
          setModeFilters(mf);
        } catch(e) {}
      } catch (e) {
        // ignore
      }

      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // reactive rendering: markers and heat when geocode or filters change
  useEffect(() => {
    if (!mapRef.current) return;
    // clear previous layers
    try {
      if (markersLayerRef.current) { mapRef.current.removeLayer(markersLayerRef.current); markersLayerRef.current = null; }
      if (heatLayerRef.current) { mapRef.current.removeLayer(heatLayerRef.current); heatLayerRef.current = null; }
    } catch(e) {}

    const keys = Object.keys(locationsMap || {});
    if (keys.length === 0) return;

    const now = Date.now();
    const cutoff = now - (daysBack * 24 * 60 * 60 * 1000);

    // build filteredKeys
    const filteredKeys = keys.filter(k => {
      const items = locationsMap[k] || [];
      return items.some((it:any) => {
        // parse date heuristics
        let dt = Date.now();
        try {
          if (it.date) dt = new Date(it.date).getTime();
          else if (it.qso_date && /^\d{8}$/.test(it.qso_date)) {
            const y = it.qso_date.substr(0,4), m = it.qso_date.substr(4,2), d = it.qso_date.substr(6,2);
            const t = (it.time || it.time_on || '0000').toString().padEnd(4,'0');
            const hh = t.substr(0,2), mm = t.substr(2,2);
            dt = new Date(`${y}-${m}-${d}T${hh}:${mm}:00Z`).getTime();
          }
        } catch(e) {}
        if (dt < cutoff) return false;
        const mode = (it.mode||'').toString().toUpperCase();
        if (Object.keys(modeFilters).length > 0 && mode && modeFilters[mode] === false) return false;
        return true;
      });
    });

    // progress reset
    setProgress({ done: 0, total: filteredKeys.length });

    // heat points
    const heatPoints: Array<[number, number, number]> = [];
    filteredKeys.forEach(k => {
      const g = geocodeResults[k]; if (!g) return;
      const weight = Math.min(10, (locationsMap[k]||[]).filter((it:any)=> {
        try {
          if (it.date) return new Date(it.date).getTime() >= cutoff;
          if (it.qso_date && /^\d{8}$/.test(it.qso_date)) {
            const y = it.qso_date.substr(0,4), m = it.qso_date.substr(4,2), d = it.qso_date.substr(6,2);
            const t = (it.time || it.time_on || '0000').toString().padEnd(4,'0');
            const hh = t.substr(0,2), mm = t.substr(2,2);
            return new Date(`${y}-${m}-${d}T${hh}:${mm}:00Z`).getTime() >= cutoff;
          }
        } catch(e) { return true; }
        return true;
      }).length || 1);
      heatPoints.push([g.lat, g.lon, weight]);
    });

    if (heatPoints.length > 0) {
      loadScript('https://unpkg.com/leaflet.heat/dist/leaflet-heat.js').then(()=>{
        try {
          const heat = (window as any).L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 9, max: 10 });
          heat.addTo(mapRef.current); heatLayerRef.current = heat;
        } catch(e) {}
      }).catch(()=>{});
    }

    // markers
    (async () => {
      try {
        await loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js');
        loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
        loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');
      } catch(e) {}
      const markers = (window as any).L.markerClusterGroup ? (window as any).L.markerClusterGroup() : null;
      if (markers) markersLayerRef.current = markers;
      for (let i = 0; i < filteredKeys.length; i++) {
        const k = filteredKeys[i];
        const g = geocodeResults[k];
        if (!g) { setProgress(prev=>({...prev, done: prev.done+1})); continue; }
        const modes = Array.from(new Set((locationsMap[k]||[]).map((x:any)=> (x.mode||'').toString()))).filter(Boolean);
        const color = (modes.map(m=>m.toUpperCase()).includes('FM')) ? '#16a34a' : ((modes.map(m=>m.toUpperCase()).includes('DSTAR')) ? '#60a5fa' : ((modes.map(m=>m.toUpperCase()).includes('DMR')) ? '#f97316' : '#94a3b8'));
        const m = (window as any).L.circleMarker([g.lat, g.lon], { radius: 8, color: '#fff', weight: 1, fillColor: color, fillOpacity: 0.95 });
        const popup = `<div><strong>${k}</strong><br/>${(locationsMap[k]||[]).slice(0,6).map((x:any)=>x.call || '').join(', ')}<br/><small>modes: ${modes.join(', ')}</small></div>`;
        m.bindPopup(popup);
        if (markers) markers.addLayer(m); else m.addTo(mapRef.current);
        setProgress(prev=>({...prev, done: prev.done+1}));
      }
      if (markers) mapRef.current.addLayer(markers);
      setFinished(true);
    })();

  }, [geocodeResults, locationsMap, daysBack, modeFilters]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
      {/* Controls: collapsible panel with mode filters and time slider */}
      {showControls ? (
        <div style={{ position:'absolute', right:12, top:12, padding:'8px 12px', background:'rgba(0,0,0,0.85)', borderRadius:8, color:'#fff', fontSize:12, maxWidth:260, zIndex: 1000 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontWeight:800 }}>Filters</div>
            <button aria-label="Close filters" onClick={() => setShowControls(false)} style={{ background:'transparent', border:'none', color:'#fff', fontSize:18, lineHeight:1, cursor:'pointer' }}>×</button>
          </div>
          <div style={{ marginBottom:6 }}>
            <label style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ width:68 }}>Days back</span>
              <input type="range" min={1} max={365} value={daysBack} onChange={e=>setDaysBack(Number((e.target as HTMLInputElement).value))} />
            </label>
            <div style={{ marginTop:6 }}>{daysBack} days</div>
          </div>
          <div style={{ marginTop:6 }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>Modes</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {Object.keys(modeFilters).length === 0 && <div style={{ opacity:0.7 }}>No modes</div>}
              {Object.keys(modeFilters).map(m => (
                <label key={m} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', padding:'4px 6px', borderRadius:6 }}>
                  <input type="checkbox" checked={!!modeFilters[m]} onChange={()=> setModeFilters(prev=>({...prev, [m]: !prev[m]}))} />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <button onClick={()=>setShowControls(true)} aria-label="Open filters" style={{ position:'absolute', right:12, top:12, padding:'8px 10px', background:'rgba(0,0,0,0.6)', borderRadius:8, color:'#fff', border:'none', cursor:'pointer', zIndex:1000 }}>
          Filters
        </button>
      )}
      {/* Legend: collapsible key */}
      {showLegend ? (
        <div style={{ position:'absolute', right:12, bottom:12, padding:'8px 12px', background:'rgba(0,0,0,0.85)', borderRadius:8, color:'#fff', fontSize:12, maxWidth:200, zIndex:1000 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontWeight:800 }}>Key</div>
            <button aria-label="Close key" onClick={()=>setShowLegend(false)} style={{ background:'transparent', border:'none', color:'#fff', fontSize:18, cursor:'pointer' }}>×</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {Object.entries(LEGEND_COLORS).map(([k,c])=> (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:14, height:14, borderRadius:7, background:c, display:'inline-block', border:'1px solid rgba(255,255,255,0.1)' }} />
                <div>{k === 'OTHER' ? 'Other' : k}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button onClick={()=>setShowLegend(true)} aria-label="Open key" style={{ position:'absolute', right:12, bottom:12, padding:'6px 8px', background:'rgba(0,0,0,0.6)', borderRadius:8, color:'#fff', border:'none', cursor:'pointer', zIndex:1000 }}>
          Key
        </button>
      )}
      {(loading || (!finished && progress.total > 0)) && (
        <div style={{ position:'absolute', left:12, top:12, padding:'8px 12px', background:'rgba(0,0,0,0.7)', borderRadius:8, color:'#fff', fontWeight:700 }}>
          {finished ? 'All pins loaded' : `Geocoding ${progress.done}/${progress.total}…`}
        </div>
      )}
    </div>
  );
}
