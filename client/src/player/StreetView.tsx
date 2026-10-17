import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../types';

declare global {
  interface Window {
    /** Called by the Maps script when the key is rejected (wrong key, referrer not allowed, API not enabled). */
    gm_authFailure?: () => void;
    /** Called by the Maps script once the whole API is loaded (the `callback` query parameter). */
    __section30MapsReady?: () => void;
  }
}

let mapsScript: Promise<void> | null = null;

/**
 * Loads the Maps JavaScript API once per page. The script tag's own load event is useless here: the
 * URL returns a small bootstrap that fetches the real API as a second file, so `google.maps` is still
 * empty when it fires. Google's `callback` parameter is the only signal that the API is ready.
 * A failed load resets so the next mount can retry.
 */
function loadMaps(apiKey: string): Promise<void> {
  if (typeof google !== 'undefined' && typeof google.maps?.StreetViewPanorama === 'function') return Promise.resolve();
  if (!mapsScript) {
    mapsScript = new Promise<void>((resolve, reject) => {
      window.__section30MapsReady = () => {
        window.__section30MapsReady = undefined;
        resolve();
      };
      const s = document.createElement('script');
      const q = new URLSearchParams({ key: apiKey, v: 'weekly', loading: 'async', callback: '__section30MapsReady' });
      s.src = `https://maps.googleapis.com/maps/api/js?${q}`;
      s.async = true;
      s.onerror = () => {
        mapsScript = null;
        window.__section30MapsReady = undefined;
        reject(new Error('script blocked: maps.googleapis.com did not load (content blocker or DNS filter?)'));
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
  const [reason, setReason] = useState<string>('');

  const fail = (why: string) => {
    console.error('[section30] Street View unavailable:', why);
    setReason(why);
    setStatus('error');
  };

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el) return;
    window.gm_authFailure = () => {
      if (!cancelled) fail('Google rejected the key (check the browser console for the Maps error name: referrer, API enablement or billing)');
    };
    (async () => {
      try {
        await loadMaps(apiKey);
        // Snap to the nearest outdoor panorama so a target that is "inside the deli" still works.
        const found = await new google.maps.StreetViewService()
          .getPanorama({ location, radius: 100, source: google.maps.StreetViewSource.OUTDOOR })
          .catch((e: unknown) => {
            console.warn('[section30] no panorama near', location, e);
            return null;
          });
        if (cancelled) return;
        const panoId = found?.data.location?.pano;
        if (!panoId) {
          setStatus('none');
          return;
        }
        startRef.current = panoId;
        panoRef.current = new google.maps.StreetViewPanorama(el, {
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
      } catch (e) {
        if (!cancelled) fail(e instanceof Error ? e.message : String(e));
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
        {reason ? <span className="tiny" style={{ display: 'block' }}>{reason}</span> : null}
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
