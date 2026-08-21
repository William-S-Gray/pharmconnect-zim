/**
 * Google Maps helpers.
 *
 * Every call goes through the API server, which holds the Maps key. The
 * key is no longer shipped to the browser at all — `VITE_GOOGLE_MAPS_API_KEY`
 * is gone, because anything in a Vite env var ends up readable in the
 * bundle and billable against this account.
 *
 * The previous version tried a Supabase Edge Function and then fell back to
 * calling Google straight from the page with the key inlined in the URL.
 * That fallback could never have worked — neither the Distance Matrix nor
 * the Geocoding API sends CORS headers — so it failed on every request
 * while exposing the key in the attempt. There is no fallback here.
 */

import { api } from './api';

export interface DistanceMatrixResult {
  distance_text: string;
  distance_value: number;
  duration_text: string;
  duration_value: number;
}

/** Driving distance and duration, or null when there is no route. */
export async function getDrivingDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<DistanceMatrixResult | null> {
  try {
    return await api.maps.drivingDistance(origin, destination);
  } catch (error) {
    console.error('Distance calculation error:', error);
    return null;
  }
}

/** Coordinates to a human-readable address, or null. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const { address } = await api.maps.reverseGeocode(lat, lng);
    return address;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}
