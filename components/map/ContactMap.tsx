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

        const cacheRaw = localStorage.getItem('kf8fvd_geo_cache') || '{}';
        const cache: Record<string, Geo> = JSON.parse(cacheRaw);

        // prepare mode-color mapping
        const modeColors: Record<string,string> = {
          'FM': '#16a34a',
          'DSTAR': '#60a5fa',
          'DIGITALVOICE': '#a78bfa',
          'DMR': '#f97316',
          'default': '#94a3b8'
        };

        const chooseColor = (modes: string[]) => {
          if (!modes || modes.length === 0) return modeColors['default'];
          const up = modes.map(s=>String(s).toUpperCase());
          for (const k of Object.keys(modeColors)) {
            if (k === 'default') continue;
            if (up.includes(k)) return modeColors[k];
          }
          return modeColors['default'];
        };

        // add legend control
        try {
          const legend = (window as any).L.control({ position: 'bottomright' });
          legend.onAdd = function() {
            const div = (window as any).L.DomUtil.create('div', 'kf8fvd-legend');
            div.style.background = 'rgba(0,0,0,0.45)';
            div.style.padding = '8px';
            div.style.borderRadius = '8px';
            div.style.color = 'white';
            div.style.fontSize = '12px';
            div.innerHTML = `<div style="font-weight:800;margin-bottom:6px">Modes</div>` +
              Object.entries(modeColors).filter(e=>e[0]!=='default').map(([m,c])=> `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style=\"width:12px;height:12px;border-radius:6px;display:inline-block;background:${c}\"></span><span>${m}</span></div>`).join('');
            return div;
          };
          legend.addTo(mapRef.current);
        } catch (e) {
          // ignore legend failures
        }

        const keys = Object.keys(locations);
        setProgress({done:0,total:keys.length});
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          let g: Geo | null = cache[k] || null;
          if (!g) {
            // respect Nominatim rate-limits
            if (i > 0) await new Promise(r => setTimeout(r, 800));
            g = await geocodeOnce(k);
            if (g) { cache[k] = g; localStorage.setItem('kf8fvd_geo_cache', JSON.stringify(cache)); }
          }
          if (g) {
            // determine predominant modes for this location
            const modes = Array.from(new Set(locations[k].map((x:any)=> (x.mode||'').toString()))).filter(Boolean);
            const color = chooseColor(modes as string[]);
            const circle = (window as any).L.circleMarker([g.lat, g.lon], { radius: 8, color: '#fff', weight: 1, fillColor: color, fillOpacity: 0.95 }).addTo(mapRef.current);
            const popup = `<div><strong>${k}</strong><br/>${locations[k].slice(0,6).map((x:any)=>x.call || '').join(', ')}<br/><small>modes: ${modes.join(', ')}</small></div>`;
            circle.bindPopup(popup);
          }
          setProgress(prev => ({...prev, done: prev.done + 1}));
        }
        setFinished(true);
      } catch (e) {
        // ignore
      }

      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
      {(loading || (!finished && progress.total > 0)) && (
        <div style={{ position:'absolute', left:12, top:12, padding:'8px 12px', background:'rgba(0,0,0,0.7)', borderRadius:8, color:'#fff', fontWeight:700 }}>
          {finished ? 'All pins loaded' : `Geocoding ${progress.done}/${progress.total}…`}
        </div>
      )}
    </div>
  );
}
