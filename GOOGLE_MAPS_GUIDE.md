# Google Maps Integration & Security Guide

This document explains how to effectively use and secure Google Maps within the PharmTrack-Zim platform.

## 1. API Key Security (CRITICAL)

The Google Maps JavaScript API key is used in the frontend to render the interactive map. To prevent unauthorized billing and usage, you **MUST** restrict your API key in the [Google Cloud Console](https://console.cloud.google.com/).

### Mandatory Restrictions:
1.  **Website Restrictions (HTTP Referrers)**:
    - Add `localhost:5173/*` for development.
    - Add your production domain (e.g., `https://pharmtrack.co.zw/*`).
2.  **API Restrictions**:
    - Limit the key to only:
        - Maps JavaScript API
        - Places API
        - Distance Matrix API
        - Geocoding API

## 2. Server-Side Proxy (Hidden API Key)

For sensitive operations like **Distance Matrix** and **Reverse Geocoding**, we use a Supabase Edge Function as a proxy. This ensures your API key is never exposed in network logs for these specific calls.

### How it works:
- Frontend calls `supabase.functions.invoke('google-maps-proxy', { body: { ... } })`.
- The Edge Function retrieves the API key from its own environment variables.
- The Edge Function performs the request and returns the result.

### Setup Instructions:
1. Ensure the Supabase CLI is installed.
2. Run `supabase functions new google-maps-proxy`.
3. Copy the provided proxy code into `supabase/functions/google-maps-proxy/index.ts`.
4. Deploy using `supabase functions deploy google-maps-proxy`.

## 3. "Find Nearest Pharmacy" Feature

This feature uses the browser's Geolocation API to find hospitals/clinics near the user.

- **Logic**: It calculates the Haversine distance between the user's coordinates and all approved pharmacies in the database.
- **SQL Optimization**: Use PostGIS (if enabled) or a simple bounding box query in Supabase for faster performance at scale.

## 4. Real-time Distance Calculation

We use the **Google Distance Matrix API** to provide precise driving distances and times.
- **Trigger**: Calculated when a user clicks on a pharmacy marker.
- **Fall-back**: Straight-line distance is used as a fallback if the API fails or is restricted.

## 5. Rate Limiting & Auth

- **Authentication**: All proxy calls are protected by Supabase Auth. Only logged-in users or legitimate site visitors (via Anon Key) can trigger these calls.
- **Rate Limiting**: Implemented via Supabase's built-in protections and client-side debouncing (preventing multiple rapid clicks).
