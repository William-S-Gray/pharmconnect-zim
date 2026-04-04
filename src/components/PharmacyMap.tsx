import React, { useMemo, useCallback, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { StockStatusBadge, type StockStatus } from './StockStatusBadge';

interface PharmacyMarker {
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
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '0.75rem',
};

const defaultCenter = {
  lat: -17.8292, // Harare
  lng: 31.0522,
};

export function PharmacyMap({ markers, center, zoom = 12 }: PharmacyMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
  });

  const [selected, setSelected] = useState<PharmacyMarker | null>(null);

  const mapCenter = useMemo(() => {
    if (center) return center;
    if (markers.length > 0) {
      return { lat: markers[0].lat, lng: markers[0].lng };
    }
    return defaultCenter;
  }, [center, markers]);

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-muted/30 rounded-xl border border-dashed">
        <p className="text-sm font-medium text-foreground">Google Maps API Key Missing</p>
        <p className="text-xs text-muted-foreground mt-1">Please add VITE_GOOGLE_MAPS_API_KEY to your .env file to enable the map.</p>
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
      {markers.map((marker) => (
        <Marker
          key={marker.pharmacy_id}
          position={{ lat: marker.lat, lng: marker.lng }}
          onClick={() => setSelected(marker)}
          icon={{
            url: getMarkerIcon(marker.stock_status),
            scaledSize: new window.google.maps.Size(30, 30),
          }}
        />
      ))}

      {selected && (
        <InfoWindow
          position={{ lat: selected.lat, lng: selected.lng }}
          onCloseClick={() => setSelected(null)}
        >
          <div className="p-2 min-w-[200px]">
            <h4 className="font-heading font-semibold text-sm">{selected.pharmacy_name}</h4>
            <p className="text-xs text-muted-foreground mb-2">{selected.suburb}, {selected.city}</p>
            <div className="flex items-center justify-between gap-2 mt-1">
              <StockStatusBadge status={selected.stock_status} />
              {selected.unit_price && (
                <span className="text-xs font-bold font-mono-drug">${selected.unit_price.toFixed(2)}</span>
              )}
            </div>
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
  // Return different colored pins based on status
  // For demo, we use data URLs or placeholders
  if (status === 'IN_STOCK') return 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
  if (status === 'LOW_STOCK') return 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
  return 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
}

const mapStyles = [
  {
    "featureType": "administrative",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#444444" }]
  },
  {
    "featureType": "landscape",
    "elementType": "all",
    "stylers": [{ "color": "#f2f2f2" }]
  },
  {
    "featureType": "poi",
    "elementType": "all",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "road",
    "elementType": "all",
    "stylers": [{ "saturation": -100 }, { "lightness": 45 }]
  },
  {
    "featureType": "road.highway",
    "elementType": "all",
    "stylers": [{ "visibility": "simplified" }]
  },
  {
    "featureType": "road.arterial",
    "elementType": "labels.icon",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "transit",
    "elementType": "all",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "water",
    "elementType": "all",
    "stylers": [{ "color": "#007A6E" }, { "visibility": "on" }]
  }
];
