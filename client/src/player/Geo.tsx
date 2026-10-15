import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import type { LatLng, PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Frame, Typewriter, formatDistance } from './common';

function MapPicker({ center, zoom, onPick }: { center: LatLng; zoom: number; onPick: (p: LatLng) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    let marker: L.CircleMarker | null = null;
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!marker) {
        marker = L.circleMarker(e.latlng, { radius: 9, color: '#ff2bd6', fillColor: '#ff2bd6', fillOpacity: 0.8 }).addTo(map);
      } else {
        marker.setLatLng(e.latlng);
      }
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    return () => {
      map.remove();
    };
    // The map is created once; later prop changes are intentionally ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="map" ref={ref} />;
}

export function Geo({ view, setView }: StageProps) {
  const g = view.geo;
  const puzzle = view.geoMode === 'puzzle';
  const confirmed = g.solved || !puzzle;
  const [pin, setPin] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const guess = async () => {
    if (!pin) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ solved: boolean; distanceM: number | null }>('/api/player/geo/guess', { json: pin });
      if (!r.solved) setMsg(`SIGNAL MISMATCH. Marker is ${r.distanceM !== null ? formatDistance(r.distanceM) : 'far'} from the source.`);
      else setMsg(null);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const proceed = async () => {
    setBusy(true);
    try {
      setView(await api<PlayerView>('/api/player/geo/proceed', { method: 'POST' }));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame title="Field transmission" className="accent">
      <Typewriter text={g.briefing} speed={3} />
      {g.photos.length ? (
        <div className="photos" style={{ marginTop: 12 }}>
          {g.photos.map((p) => (
            <img key={p} src={`/uploads/${p}`} alt="Field image" className={g.photos.length === 1 ? 'one' : ''} />
          ))}
        </div>
      ) : puzzle ? (
        <p className="muted small">[IMAGE BURST NOT YET RECOVERED]</p>
      ) : null}
      {!confirmed ? (
        <>
          <MapPicker center={g.mapCenter} zoom={g.mapZoom} onPick={setPin} />
          <p className="tiny">Tap the map to place the marker, then triangulate.</p>
          <button className="btn primary block" onClick={guess} disabled={!pin || busy}>
            Triangulate
          </button>
          {msg ? <div className="error">{msg}</div> : null}
          {g.attempts ? <div className="tiny" style={{ marginTop: 8 }}>Attempts: {g.attempts}</div> : null}
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          <h2 className="green">{g.revealTitle}</h2>
          <pre className="typed">{g.revealBody}</pre>
          <button className="btn primary block" onClick={proceed} disabled={busy} style={{ marginTop: 12 }}>
            Proceed
          </button>
        </div>
      )}
      {err ? <div className="error">{err}</div> : null}
    </Frame>
  );
}
