/**
 * Google Maps Proxy Utility
 * 
 * This utility provides a secure way to call Google Maps APIs.
 * In production, these calls should be routed through a backend (like Supabase Edge Functions)
 * to hide the API key and implement rate limiting.
 */

import { supabase } from './supabaseClient';

export interface DistanceMatrixResult {
  distance_text: string;
  distance_value: number;
  duration_text: string;
  duration_value: number;
}

/**
 * Calculates the driving distance and duration between two points.
 * Routes through the Supabase 'google-maps-proxy' Edge Function.
 */
export async function getDrivingDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DistanceMatrixResult | null> {
  try {
    // Attempt to use the Edge Function proxy first (Secure)
    const { data, error } = await supabase.functions.invoke('google-maps-proxy', {
      body: { 
        type: 'distance-matrix',
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`
      }
    });

    if (!error && data) {
      return data;
    }

    // Fallback: Direct call (Only for development, requires API key in .env)
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destination.lat},${destination.lng}&key=${apiKey}`;
    
    // Note: This may fail due to CORS if called directly from browser.
    // This is why the Edge Function proxy is mandatory for production.
    const response = await fetch(url);
    const json = await response.json();

    if (json.rows?.[0]?.elements?.[0]?.status === 'OK') {
      const element = json.rows[0].elements[0];
      return {
        distance_text: element.distance.text,
        distance_value: element.distance.value,
        duration_text: element.duration.text,
        duration_value: element.duration.value
      };
    }

    return null;
  } catch (error) {
    console.error('Distance calculation error:', error);
    return null;
  }
}

/**
 * Performs Reverse Geocoding (GPS -> Address)
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('google-maps-proxy', {
      body: { type: 'reverse-geocode', lat, lng }
    });

    if (!error && data?.address) return data.address;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const response = await fetch(url);
    const json = await response.json();

    if (json.results?.[0]) {
      return json.results[0].formatted_address;
    }

    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}
