import { useState, useEffect } from 'react';

export interface GeolocationState {
  lat: number | null;
  lng: number | null;
  loading: boolean;
  error: string | null;
  /** true when coords come from the Harare fallback (permission denied / unavailable) */
  isFallback: boolean;
}

/** Harare city centre coordinates used as fallback */
export const HARARE_FALLBACK = { lat: -17.8292, lng: 31.0522 };

/**
 * useGeolocation — Returns the user's current position.
 * Falls back to Harare coordinates if permission is denied or geolocation
 * is unavailable (e.g. non-HTTPS, unsupported browser).
 */
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    loading: true,
    error: null,
    isFallback: false,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({
        ...HARARE_FALLBACK,
        loading: false,
        error: 'Geolocation is not supported by this browser.',
        isFallback: true,
      });
      return;
    }

    let cancelled = false;

    const onSuccess = (pos: GeolocationPosition) => {
      if (cancelled) return;
      setState({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        loading: false,
        error: null,
        isFallback: false,
      });
    };

    const onError = (err: GeolocationPositionError) => {
      if (cancelled) return;
      let message = 'Unable to determine your location.';
      if (err.code === err.PERMISSION_DENIED) {
        message = 'Location permission denied. Showing results near Harare.';
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        message = 'Location information is unavailable.';
      } else if (err.code === err.TIMEOUT) {
        message = 'Location request timed out.';
      }
      setState({
        ...HARARE_FALLBACK,
        loading: false,
        error: message,
        isFallback: true,
      });
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 1000 * 60 * 5, // cache for 5 min
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
