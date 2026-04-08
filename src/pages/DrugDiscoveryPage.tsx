import React, { useState, useMemo, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { DrugSearchWidget, type DrugSearchResult } from '@/components/DrugSearchWidget';
import { PharmacyMap, type PharmacyMarker } from '@/components/PharmacyMap';
import { useGeolocation, HARARE_FALLBACK } from '@/hooks/use-geolocation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Map as MapIcon, List, Zap, Star } from 'lucide-react';
import { type StockStatus } from '@/components/StockStatusBadge';

type ViewMode = 'split' | 'list' | 'map';

const DrugDiscoveryPage: React.FC = () => {
  const [results, setResults] = useState<DrugSearchResult[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  const geo = useGeolocation();
  const userLocation = geo.lat && geo.lng
    ? { lat: geo.lat, lng: geo.lng }
    : HARARE_FALLBACK;

  // Build map markers from results (deduplicate by pharmacy)
  const mapMarkers = useMemo<PharmacyMarker[]>(() => {
    const seen = new Set<string>();
    return results
      .filter(r => r.lat && r.lng && !seen.has(r.pharmacy_id) && seen.add(r.pharmacy_id) !== undefined)
      .map(r => ({
        pharmacy_id:   r.pharmacy_id,
        pharmacy_name: r.pharmacy_name,
        lat:           r.lat,
        lng:           r.lng,
        suburb:        r.suburb,
        city:          r.city,
        stock_status:  r.stock_status as StockStatus,
        quantity:      r.quantity,
        unit_price:    r.unit_price,
      }));
  }, [results]);

  // Cheapest in-stock pharmacy
  const cheapestPharmacyId = useMemo(() => {
    const inStock = results.filter(r => r.stock_status !== 'OUT_OF_STOCK' && r.unit_price != null);
    if (!inStock.length) return null;
    const minPrice = Math.min(...inStock.map(r => r.unit_price!));
    return inStock.find(r => r.unit_price === minPrice)?.pharmacy_id ?? null;
  }, [results]);

  const handleResultsChange = useCallback((newResults: DrugSearchResult[]) => {
    setResults(newResults);
    setSelectedPharmacyId(null);
  }, []);

  const handlePharmacySelect = useCallback((result: DrugSearchResult) => {
    setSelectedPharmacyId(result.pharmacy_id);
  }, []);

  const handleMarkerSelect = useCallback((marker: PharmacyMarker) => {
    setSelectedPharmacyId(marker.pharmacy_id);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* ── Hero bar ──────────────────────────────────────────────────────── */}
      <div
        className="border-b"
        style={{
          background: 'linear-gradient(180deg, hsl(174 90% 28%) 0%, hsl(174 100% 20%) 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 2px 12px rgba(0,0,0,0.2)',
        }}
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-heading font-bold text-lg leading-tight">Drug Discovery</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <MapPin className="w-3 h-3 text-white/60" />
                  <p className="text-white/70 text-xs">
                    {geo.loading ? 'Detecting location…' : geo.isFallback ? 'Near Harare (fallback)' : 'Using your location'}
                  </p>
                </div>
              </div>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1 bg-white/10 p-1 rounded-lg">
              {(['split', 'list', 'map'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: viewMode === mode ? 'rgba(255,255,255,0.9)' : 'transparent',
                    color: viewMode === mode ? 'hsl(174 100% 20%)' : 'rgba(255,255,255,0.75)',
                  }}
                >
                  {mode === 'split' && <><Zap className="w-3 h-3" /> Split</>}
                  {mode === 'list' && <><List className="w-3 h-3" /> List</>}
                  {mode === 'map' && <><MapIcon className="w-3 h-3" /> Map</>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats bar (when results exist) ───────────────────────────────── */}
      {results.length > 0 && (
        <div
          className="border-b px-4 py-2"
          style={{ background: 'hsl(var(--muted)/0.5)' }}
        >
          <div className="container mx-auto flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
            <span><strong className="text-foreground">{results.length}</strong> results</span>
            <span><strong className="text-foreground">{mapMarkers.length}</strong> pharmacies</span>
            {cheapestPharmacyId && (
              <span className="flex items-center gap-1" style={{ color: 'hsl(45 80% 35%)' }}>
                <Star className="w-3 h-3" />
                Cheapest highlighted in gold
              </span>
            )}
            {geo.isFallback && (
              <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-700">
                📍 Location fallback: Harare
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="flex-1 container mx-auto px-4 py-5">

        {/* Mobile: stacked layout */}
        <div className="lg:hidden space-y-4">
          {/* Search */}
          <div
            className="rounded-2xl border p-4"
            style={{
              background: 'hsl(var(--card))',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <DrugSearchWidget
              onResultsChange={handleResultsChange}
              onPharmacySelect={handlePharmacySelect}
              highlightCheapest
            />
          </div>

          {/* Map (only in map/split mode on mobile) */}
          {viewMode !== 'list' && results.length > 0 && (
            <div
              className="rounded-2xl overflow-hidden border"
              style={{ height: '320px', boxShadow: 'var(--shadow-card)' }}
            >
              <PharmacyMap
                markers={mapMarkers}
                selectedPharmacyId={selectedPharmacyId}
                onMarkerSelect={handleMarkerSelect}
                cheapestPharmacyId={cheapestPharmacyId}
                userLocation={userLocation}
              />
            </div>
          )}
        </div>

        {/* Desktop: side-by-side split view */}
        <div className="hidden lg:grid lg:gap-5" style={{
          gridTemplateColumns: viewMode === 'map' ? '0fr 1fr' : viewMode === 'list' ? '1fr 0fr' : '420px 1fr',
          transition: 'grid-template-columns 0.3s ease',
        }}>
          {/* Left: Search panel */}
          {viewMode !== 'map' && (
            <div
              className="rounded-2xl border overflow-hidden flex flex-col"
              style={{
                background: 'hsl(var(--card))',
                boxShadow: 'var(--shadow-card)',
                maxHeight: 'calc(100vh - 160px)',
              }}
            >
              <div className="p-4 border-b" style={{ background: 'hsl(var(--muted)/0.4)' }}>
                <h2 className="font-heading font-semibold text-sm text-foreground">Search Results</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin' }}>
                <DrugSearchWidget
                  onResultsChange={handleResultsChange}
                  onPharmacySelect={handlePharmacySelect}
                  highlightCheapest
                />
              </div>
            </div>
          )}

          {/* Right: Map panel */}
          {viewMode !== 'list' && (
            <div
              className="rounded-2xl overflow-hidden border"
              style={{
                boxShadow: 'var(--shadow-card)',
                height: 'calc(100vh - 160px)',
                position: 'sticky',
                top: '80px',
              }}
            >
              {results.length === 0 ? (
                <div
                  className="w-full h-full flex flex-col items-center justify-center gap-3"
                  style={{ background: 'hsl(var(--muted)/0.3)' }}
                >
                  <MapIcon className="w-12 h-12 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Map will populate when you search</p>
                </div>
              ) : (
                <PharmacyMap
                  markers={mapMarkers}
                  selectedPharmacyId={selectedPharmacyId}
                  onMarkerSelect={handleMarkerSelect}
                  cheapestPharmacyId={cheapestPharmacyId}
                  userLocation={userLocation}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DrugDiscoveryPage;
