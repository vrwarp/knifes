import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import { fill, type LatLng, type PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Frame, Typewriter, formatDistance } from './common';
import { StreetView } from './StreetView';

function MapPicker({ center, zoom, onPick, labels }: { center: LatLng; zoom: number; onPick: (p: LatLng) => void; labels: { unlock: string; lock: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [locked, setLocked] = useState(true);
  useEffect(() => {
    if (!ref.current) return;
    // Starts locked so the page scrolls past it; one tap hands the gestures to the map.
    const map = L.map(ref.current, { dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false }).setView(
      [center.lat, center.lng],
      zoom,
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    let marker: L.CircleMarker | null = null;
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!marker) marker = L.circleMarker(e.latlng, { radius: 10, color: '#ff2bd6', fillColor: '#ff2bd6', fillOpacity: 0.85, weight: 3 }).addTo(map);
      else marker.setLatLng(e.latlng);
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are intentionally ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setInteractive = (on: boolean) => {
    const m = mapRef.current;
    if (!m) return;
    for (const h of [m.dragging, m.touchZoom, m.scrollWheelZoom, m.doubleClickZoom]) on ? h.enable() : h.disable();
    setLocked(!on);
  };
  return (
    <div className={`map-wrap ${locked ? 'locked' : ''}`}>
      <div className="map" ref={ref} aria-label="Map" />
      {locked ? (
        <button type="button" className="map-lock" onClick={() => setInteractive(true)}>
          <span className="map-lock-label">{labels.unlock}</span>
        </button>
      ) : (
        <button type="button" className="btn small map-unlock-btn" onClick={() => setInteractive(false)}>
          {labels.lock}
        </button>
      )}
    </div>
  );
}

/** `onReturn` set: the player stepped back from the secure line to look again, so Proceed just returns there. */
export function Geo({ view, setView, onReturn }: StageProps & { onReturn?: () => void }) {
  const g = view.geo;
  const t = view.text.geo;
  const puzzle = view.geoMode === 'puzzle';
  const confirmed = g.solved || !puzzle;
  const [pin, setPin] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const guess = async () => {
    if (!pin) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ solved: boolean; distanceM: number | null }>('/api/player/geo/guess', { json: pin });
      if (!r.solved) setMsg(fill(t.mismatch, { distance: r.distanceM !== null ? formatDistance(r.distanceM) : 'far' }));
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
    <Frame title={t.title} className={`accent ${confirmed && puzzle ? 'success' : ''}`}>
      <Typewriter text={g.briefing} speed={3} />
      {g.streetView ? <StreetView {...g.streetView} text={t} /> : null}
      {g.streetView && !confirmed ? <p className="tiny">{g.streetView.allowMoving ? t.feedHelpMoving : t.feedHelp}</p> : null}
      {g.photos.length ? (
        <div className="photos" aria-label="Field images, tap one to enlarge">
          {g.photos.map((p, i) => (
            <img key={p} src={`/uploads/${p}`} alt={`Field image ${i + 1}. Tap to enlarge.`} onClick={() => setZoomed(`/uploads/${p}`)} />
          ))}
        </div>
      ) : puzzle && !g.streetView && !confirmed ? (
        <p className="muted small">{t.photosMissing}</p>
      ) : null}
      {g.photos.length ? <p className="tiny">{t.photosHelp}</p> : null}
      {!confirmed ? (
        <>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {g.streetView ? t.mapHelpAfterFeed : t.mapHelp}
          </p>
          <MapPicker center={g.mapCenter} zoom={g.mapZoom} onPick={setPin} labels={{ unlock: t.unlockMap, lock: t.lockMap }} />
          <button className="btn primary block" onClick={guess} disabled={!pin || busy}>
            {t.triangulate}
          </button>
          {msg ? (
            <div className="error" role="alert">
              {msg}
            </div>
          ) : null}
          {g.attempts ? <div className="tiny" style={{ marginTop: 8 }}>{fill(t.attempts, { n: g.attempts })}</div> : null}
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          <h2 className="green">{g.revealTitle}</h2>
          <pre className="typed">{g.revealBody}</pre>
          {g.target ? (
            <a
              className="btn block"
              href={`https://www.google.com/maps/search/?api=1&query=${g.target.lat},${g.target.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 12 }}
            >
              {t.openInMaps}
            </a>
          ) : null}
          <button className="btn primary block" onClick={onReturn ?? proceed} disabled={busy} style={{ marginTop: 12 }}>
            {onReturn ? t.returnToLine : t.proceed}
          </button>
        </div>
      )}
      {err ? <div className="error">{err}</div> : null}
      {zoomed ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Field image" onClick={() => setZoomed(null)}>
          <div className="frame zoomed" onClick={(e) => e.stopPropagation()}>
            <img src={zoomed} alt="Field image, enlarged" />
            <button className="btn block" onClick={() => setZoomed(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </Frame>
  );
}
