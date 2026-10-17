import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../types';

declare global {
  interface Window {
    /** Called by the Maps script when the key is rejected (wrong key, referrer not allowed, API not enabled). */
    gm_authFailure?: () => void;
  }
}

let mapsScript: Promise<void> | null = null;

/** Loads the Maps JavaScript API once per page; a failed load resets so the next try can retry. */
function loadMaps(apiKey: string): Promise<void> {
  if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') return Promise.resolve();
  if (!mapsScript) {
    mapsScript = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      const q = new URLSearchParams({ key: apiKey, v: 'weekly', loading: 'async' });
      s.src = `https://maps.googleapis.com/maps/api/js?${q}`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        mapsScript = null;
        reject(new Error('Street View script failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return mapsScript;
}

export interface StreetViewProps {
  apiKey: string;
  location: LatLng;
  heading: number;
  pitch: number;
  allowMoving: boolean;
}

/**
 * A GeoGuessr-style panorama: look around (and walk, when allowed) with the address and road
 * labels hidden. Starts locked like the map so the page still scrolls past it on a phone.
 */
export function StreetView({ apiKey, location, heading, pitch, allowMoving }: StreetViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const startRef = useRef<string | null>(null);
  const [locked, setLocked] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el) return;
    window.gm_authFailure = () => {
      if (!cancelled) setStatus('error');
    };
    (async () => {
      try {
        await loadMaps(apiKey);
        const lib = (await google.maps.importLibrary('streetView')) as google.maps.StreetViewLibrary;
        // Snap to the nearest outdoor panorama so a target that is "inside the deli" still works.
        const found = await new lib.StreetViewService()
          .getPanorama({ location, radius: 100, source: google.maps.StreetViewSource.OUTDOOR })
          .catch(() => null);
        if (cancelled) return;
        const panoId = found?.data.location?.pano;
        if (!panoId) {
          setStatus('none');
          return;
        }
        startRef.current = panoId;
        panoRef.current = new lib.StreetViewPanorama(el, {
          pano: panoId,
          pov: { heading, pitch },
          addressControl: false,
          showRoadLabels: false,
          imageDateControl: false,
          enableCloseButton: false,
          motionTracking: false,
          motionTrackingControl: false,
          fullscreenControl: true,
          zoomControl: true,
          panControl: true,
          linksControl: allowMoving,
          clickToGo: allowMoving,
          disableDefaultUI: false,
        });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      window.gm_authFailure = undefined;
      panoRef.current?.setVisible(false);
      panoRef.current = null;
    };
    // The panorama is created once; later prop changes are intentionally ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backToStart = () => {
    const p = panoRef.current;
    if (!p || !startRef.current) return;
    p.setPano(startRef.current);
    p.setPov({ heading, pitch });
  };

  if (status === 'none' || status === 'error') {
    return (
      <p className="muted small" role="status">
        {status === 'none' ? '[FEED OFFLINE: NO STREET-LEVEL IMAGERY AT THE SOURCE]' : '[FEED OFFLINE: STREET VIEW FAILED TO LOAD]'}
      </p>
    );
  }
  return (
    <div className={`sv-wrap ${locked ? 'locked' : ''}`}>
      <div className="streetview" ref={ref} aria-label="Street View feed" />
      {status === 'loading' ? <div className="sv-loading muted small">[RECOVERING FEED]</div> : null}
      {locked ? (
        <button type="button" className="map-lock" onClick={() => setLocked(false)}>
          <span className="map-lock-label">Tap to look around</span>
        </button>
      ) : (
        <div className="sv-controls">
          {allowMoving ? (
            <button type="button" className="btn small" onClick={backToStart}>
              Back to start
            </button>
          ) : null}
          <button type="button" className="btn small" onClick={() => setLocked(true)}>
            Lock feed
          </button>
        </div>
      )}
    </div>
  );
}
