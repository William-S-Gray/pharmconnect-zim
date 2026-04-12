import React, { useMemo, useState, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindow } from '@react-google-maps/api';
import { StockStatusBadge, type StockStatus } from './StockStatusBadge';
import { getDrivingDistance, type DistanceMatrixResult } from '@/lib/googleMapsProxy';
import { useSearchStore } from '@/stores/searchStore';

const GOOGLE_MAPS_LIBRARIES: ("places" | "drawing" | "geometry" | "localContext" | "visualization")[] = ['places'];

export interface PharmacyMarker {
  pharmacy_id: string;
  pharmacy_name: string;
  lat: number;
  lng: number;
  suburb: string;
  city: string;
  stock_status: StockStatus;
  quantity: number;
  unit_price: number | null;
}

interface PharmacyMapProps {
  markers: PharmacyMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  /** pharmacy_id of the currently selected pharmacy (syncs with list) */
  selectedPharmacyId?: string | null;
  /** Called when user clicks a marker */
  onMarkerSelect?: (marker: PharmacyMarker) => void;
  /** User location to show a blue dot */
  userLocation?: { lat: number; lng: number } | null;
  /** pharmacy_id of the cheapest pharmacy (shown with gold star) */
  cheapestPharmacyId?: string | null;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '0.75rem',
};

const defaultCenter = {
  lat: -17.8292,
  lng: 31.0522,
};

export function PharmacyMap({
  markers,
  center,
  zoom = 12,
  selectedPharmacyId,
  onMarkerSelect,
  userLocation,
  cheapestPharmacyId,
}: PharmacyMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [selected, setSelected] = useState<PharmacyMarker | null>(null);
  const [distanceInfo, setDistanceInfo] = useState<DistanceMatrixResult | null>(null);
  const { userLat, userLng } = useSearchStore();

  // Sync external selection → open InfoWindow
  useEffect(() => {
    if (selectedPharmacyId) {
      const found = markers.find(m => m.pharmacy_id === selectedPharmacyId);
      if (found) {
        setSelected(found);
        setDistanceInfo(null);
      }
    } else {
      setSelected(null);
    }
  }, [selectedPharmacyId, markers]);

  const effectiveUserLat = userLocation?.lat ?? userLat;
  const effectiveUserLng = userLocation?.lng ?? userLng;

  const handleSelect = async (marker: PharmacyMarker) => {
    setSelected(marker);
    setDistanceInfo(null);
    onMarkerSelect?.(marker);
    if (effectiveUserLat && effectiveUserLng) {
      const info = await getDrivingDistance(
        { lat: effectiveUserLat, lng: effectiveUserLng },
        { lat: marker.lat, lng: marker.lng }
      );
      setDistanceInfo(info);
    }
  };

  const mapCenter = useMemo(() => {
    if (center) return center;
    if (markers.length > 0) return { lat: markers[0].lat, lng: markers[0].lng };
    return defaultCenter;
  }, [center, markers]);

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-muted/30 rounded-xl border border-dashed">
        <p className="text-sm font-medium text-foreground">Google Maps API Key Missing</p>
        <p className="text-xs text-muted-foreground mt-1">Add VITE_GOOGLE_MAPS_API_KEY to your .env file.</p>
      </div>
    );
  }

  return isLoaded ? (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={mapCenter}
      zoom={zoom}
      options={{
        styles: mapStyles,
        disableDefaultUI: true,
        zoomControl: true,
      }}
    >
      {/* User location dot */}
      {userLocation && (
        <MarkerF
          position={userLocation}
          icon={{
            url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            scaledSize: new window.google.maps.Size(28, 28),
          }}
          title="Your location"
        />
      )}

      {markers.map((marker) => {
        const isCheapest = cheapestPharmacyId === marker.pharmacy_id;
        const isSelected = selected?.pharmacy_id === marker.pharmacy_id;
        return (
          <MarkerF
            key={marker.pharmacy_id}
            position={{ lat: marker.lat, lng: marker.lng }}
            icon={{
              url: isCheapest
                ? 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png'
                : getMarkerIcon(marker.stock_status),
              scaledSize: new window.google.maps.Size(isSelected ? 38 : 30, isSelected ? 38 : 30),
            }}
            zIndex={isSelected ? 999 : isCheapest ? 100 : 1}
            onClick={() => handleSelect(marker)}
          />
        );
      })}

      {selected && (
        <InfoWindow
          position={{ lat: selected.lat, lng: selected.lng }}
          onCloseClick={() => { setSelected(null); setDistanceInfo(null); }}
        >
          <div style={{ padding: '6px 2px', minWidth: '210px', fontFamily: 'DM Sans, sans-serif' }}>
            <p style={{ fontWeight: 600, fontSize: '13px', margin: '0 0 2px', color: '#111827' }}>
              {selected.pharmacy_name}
            </p>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 6px' }}>
              {selected.suburb}, {selected.city}
            </p>

            {distanceInfo && (
              <div style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '6px',
                padding: '5px 8px',
                marginBottom: '8px',
                fontSize: '11px',
                color: '#166534',
                fontWeight: 500,
              }}>
                🚗 {distanceInfo.distance_text} · {distanceInfo.duration_text} drive
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '8px' }}>
              <StockStatusBadge status={selected.stock_status} />
              {selected.unit_price && (
                <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#059669' }}>
                  ${selected.unit_price.toFixed(2)}
                </span>
              )}
            </div>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textAlign: 'center',
                background: 'hsl(174, 100%, 24%)',
                color: '#fff',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                marginBottom: '4px',
              }}
            >
              Get Directions →
            </a>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  ) : (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm text-muted-foreground">Loading Map...</p>
    </div>
  );
}

function getMarkerIcon(status: StockStatus): string {
  if (status === 'IN_STOCK') return 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
  if (status === 'LOW_STOCK') return 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png';
  return 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
}

const mapStyles = [
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
  { featureType: 'landscape', elementType: 'all', stylers: [{ color: '#f2f2f2' }] },
  { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'all', stylers: [{ saturation: -100 }, { lightness: 45 }] },
  { featureType: 'road.highway', elementType: 'all', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.arterial', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'all', stylers: [{ color: '#007A6E' }, { visibility: 'on' }] },
];
