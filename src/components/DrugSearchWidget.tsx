import React, { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, Loader2, AlertTriangle, Package, Pill } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/use-debounce';
import { useGeolocation, HARARE_FALLBACK } from '@/hooks/use-geolocation';
import { type StockStatus } from '@/components/StockStatusBadge';
import { SmartEmptyState } from '@/components/SmartEmptyState';
import { GuidedRecovery } from '@/components/GuidedRecovery';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface DrugSearchResult {
  pharmacy_id: string;
  pharmacy_name: string;
  suburb: string;
  city: string;
  phone: string;
  lat: number;
  lng: number;
  drug_id: string;
  drug_name: string;
  unit_price: number | null;
  quantity: number;
  stock_status: StockStatus;
  distance_km: number;
}

interface DrugSearchWidgetProps {
  /** Called when results change (e.g. to sync the map) */
  onResultsChange?: (results: DrugSearchResult[]) => void;
  /** Called when a user clicks a result row */
  onPharmacySelect?: (result: DrugSearchResult) => void;
  /** If true, highlights the cheapest result differently */
  highlightCheapest?: boolean;
  /** Pre-fill the search field */
  initialQuery?: string;
  /** Optional city filter */
  city?: string;
  /** Show compact variant without the SmartEmptyState below */
  compact?: boolean;
}

// ─── Skeleton loader ─────────────────────────────────────────────────────────
function ResultSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-xl border border-border"
          style={{ background: 'hsl(var(--card))' }}
        >
          <div className="w-9 h-9 rounded-lg bg-muted flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-muted rounded w-1/2" />
            <div className="h-3 bg-muted rounded w-3/4" />
          </div>
          <div className="h-4 bg-muted rounded w-12" />
        </div>
      ))}
    </div>
  );
}

// ─── Single result row ────────────────────────────────────────────────────────
interface ResultRowProps {
  result: DrugSearchResult;
  isCheapest: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function ResultRow({ result, isCheapest, isSelected, onClick }: ResultRowProps) {
  const statusColor: Record<StockStatus, string> = {
    IN_STOCK:    'hsl(142 70% 45%)',
    LOW_STOCK:   'hsl(38 95% 50%)',
    OUT_OF_STOCK:'hsl(0 72% 51%)',
  };

  return (
    <div
      onClick={onClick}
      className={`w-full text-left flex flex-wrap items-start gap-3 p-3 rounded-xl border transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
        isSelected 
          ? 'bg-primary/10 dark:bg-primary/20 border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.3)]' 
          : isCheapest 
          ? 'border-[#ffb700] dark:border-[#d99b00] shadow-[0_0_0_2px_rgba(255,183,0,0.2)]' 
          : 'border-border shadow-sm'
      }`}
      style={{
        background: isSelected 
          ? undefined 
          : 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted)/0.3) 100%)'
      }}
    >
      {/* Status dot */}
      <div
        className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
        style={{ background: statusColor[result.stock_status] }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm text-foreground truncate">{result.drug_name}</span>
          {isCheapest && (
            <Badge
              className="text-[10px] px-1.5 py-0 h-4 shrink-0"
              style={{ background: 'hsl(45 95% 52%)', color: '#7a4f00', border: '1px solid hsl(45 80% 62%)' }}
            >
              ⭐ Cheapest
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {result.pharmacy_name} · {result.suburb}
          {result.distance_km > 0 && (
            <span className="ml-1 text-primary font-medium">{result.distance_km} km</span>
          )}
        </p>
      </div>

      {/* Price */}
      <div className="flex-shrink-0 text-right">
        {result.unit_price != null ? (
          <span className="font-mono font-bold text-sm text-foreground">${result.unit_price.toFixed(2)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        <p className="text-[10px] text-muted-foreground capitalize">
          {result.stock_status === 'IN_STOCK' ? 'In stock' : result.stock_status === 'LOW_STOCK' ? 'Low' : 'Out'}
        </p>
      </div>
      
      {isSelected && (
        <div className="w-full flex justify-between mt-2 pt-2 border-t border-border/50 items-center col-span-full" style={{ gridColumn: '1 / -1' }}>
          <a 
            href={`https://www.google.com/maps/dir/?api=1&destination=${result.lat},${result.lng}`} 
            target="_blank" 
            rel="noopener noreferrer" 
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-primary hover:underline bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/20"
          >
            Get Directions
          </a>
          <button 
            onClick={(e) => { e.stopPropagation(); /* Hook up reservation logic later */ }} 
            className="text-xs font-medium bg-secondary text-secondary-foreground px-3 py-1.5 rounded-lg hover:bg-secondary/90 transition-colors"
          >
            Reserve Drug
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
export function DrugSearchWidget({
  onResultsChange,
  onPharmacySelect,
  highlightCheapest = true,
  initialQuery = '',
  city,
  compact = false,
}: DrugSearchWidgetProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<DrugSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [intent, setIntent] = useState<'DRUG' | 'SYMPTOM_CLEAR' | 'SYMPTOM_COMPLEX' | 'UNKNOWN' | null>(null);

  const debouncedQuery = useDebounce(query, 300);
  const geo = useGeolocation();

  const userLat = geo.lat ?? HARARE_FALLBACK.lat;
  const userLng = geo.lng ?? HARARE_FALLBACK.lng;

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      onResultsChange?.([]);
      setSearched(false);
      return;
    }

    
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      // One request. Search returns the intent alongside the results and
      // records the query server-side, so the three separate RPCs this
      // replaced — detect_search_intent, find_nearby_pharmacies and two
      // fire-and-forget log_smart_search calls — collapse into it.
      const response = await api.search.drugs({
        q: q.trim(),
        lat: userLat ?? undefined,
        lng: userLng ?? undefined,
        radius_km: 50,
        city: city ?? undefined,
      });

      setIntent(response.intent as any);

      const mapped: DrugSearchResult[] = response.results.map((row) => ({
        pharmacy_id:   row.pharmacy_id,
        pharmacy_name: row.pharmacy_name,
        suburb:        row.suburb ?? '',
        city:          row.city,
        phone:         row.phone ?? '',
        lat:           row.lat ?? 0,
        lng:           row.lng ?? 0,
        drug_id:       row.drug_id ?? '',
        drug_name:     row.drug_name,
        // Already a number: the API client parses NUMERIC columns, so the
        // parseFloat this replaced is no longer needed.
        unit_price:    row.unit_price,
        quantity:      row.quantity,
        stock_status:  row.stock_status as StockStatus,
        distance_km:   row.distance_km ?? 0,
      }));

      setResults(mapped);
      onResultsChange?.(mapped);
    } catch (err: any) {
      console.error('DrugSearchWidget search error:', err);
      setError(err?.message || 'Search failed. Please try again.');
      setResults([]);
      onResultsChange?.([]);
    } finally {
      setLoading(false);
    }
  }, [userLat, userLng, city, onResultsChange]);

  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery, runSearch]);

  const handleSelect = (r: DrugSearchResult) => {
    setSelectedId(r.pharmacy_id);
    onPharmacySelect?.(r);
  };

  // Find cheapest in-stock result
  const inStockResults = results.filter(r => r.stock_status !== 'OUT_OF_STOCK' && r.unit_price != null);
  const cheapestPrice = inStockResults.length > 0
    ? Math.min(...inStockResults.map(r => r.unit_price!))
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          id="drug-search-widget-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search drug name or symptom…"
          className="pl-10 pr-10 h-11 text-sm"
          style={{ boxShadow: 'var(--shadow-card)' }}
        />
        {/* Location indicator */}
        <div 
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center"
          title={geo.isFallback ? `Location unavailable — showing Harare` : 'Using your location'}
        >
          {geo.loading ? (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          ) : (
            <MapPin
              className="w-3.5 h-3.5"
              style={{ color: geo.isFallback ? 'hsl(45 90% 50%)' : 'hsl(142 70% 45%)' }}
            />
          )}
        </div>
      </div>

      {/* Location fallback notice */}
      {geo.isFallback && query.trim().length > 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1.5 px-1">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          Showing results near Harare (location access denied)
        </p>
      )}

      {/* Loading state */}
      {loading && <ResultSkeleton />}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && !error && results.length > 0 && (
        <div className="max-h-[500px] overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin' }}>
          {/* Summary bar */}
          <div className="flex items-center justify-between px-0.5 py-2 mb-2 sticky top-0 bg-background/95 backdrop-blur z-10 w-full mb-1">
            <span className="text-xs text-muted-foreground">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
            {cheapestPrice != null && highlightCheapest && (
              <span className="text-xs font-medium" style={{ color: 'hsl(45 80% 35%)' }}>
                ⭐ Cheapest: ${cheapestPrice.toFixed(2)}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-2">
            {results.map(r => (
              <ResultRow
                key={`${r.pharmacy_id}-${r.drug_id}`}
                result={r}
                isCheapest={highlightCheapest && r.unit_price === cheapestPrice && cheapestPrice != null}
                isSelected={selectedId === r.pharmacy_id}
                onClick={() => handleSelect(r)}
              />
            ))}
          </div>
        </div>
      )}


      {/* Guided Recovery for Complex/Unknown Intent */}
      {!loading && !error && searched && ['SYMPTOM_COMPLEX', 'UNKNOWN'].includes(intent || '') && !compact && (
        <GuidedRecovery 
          query={query} 
          onSuggestionSelect={(suggestion) => setQuery(suggestion)} 
        />
      )}

      {/* Empty / Smart state */}
      {!loading && !error && searched && results.length === 0 && !['SYMPTOM_COMPLEX', 'UNKNOWN'].includes(intent || '') && !compact && (
        <SmartEmptyState
          query={query}
          city={city}
          onSearchSuggestion={suggestion => setQuery(suggestion)}
        />
      )}

      {/* Idle placeholder */}
      {!loading && !searched && !compact && (
        <div className="flex flex-col items-center py-8 text-center">
          <Pill className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground max-w-xs">
            Search a drug name like <strong className="text-foreground">paracetamol</strong>, or describe a symptom like <strong className="text-foreground">headache</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
