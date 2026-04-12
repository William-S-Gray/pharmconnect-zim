import { useSearchParams } from 'react-router-dom';
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/Navbar';
import { DrugSearchBar } from '@/components/DrugSearchBar';
import { PharmacyResultCard } from '@/components/PharmacyResultCard';
import { SmartEmptyState } from '@/components/SmartEmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { DrugInfoPanel } from '@/components/DrugInfoPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Map as MapIcon, List, BookOpen, ChevronDown, ChevronUp, WifiOff } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { type StockStatus } from '@/components/StockStatusBadge';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { PharmacyMap } from '@/components/PharmacyMap';
import { toast } from 'sonner';

function computeIsOpenNow(operatingHours: any, isOpen24h: boolean): boolean {
  if (isOpen24h) return true;
  if (!operatingHours) return false;
  try {
    const now = new Date();
    // Zimbabwe is CAT (UTC+2)
    const catOffset = 2 * 60;
    const localMinutes = ((now.getUTCHours() * 60 + now.getUTCMinutes() + catOffset) % (24 * 60));
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const dayKey = days[now.getUTCDay()];
    const hours = operatingHours[dayKey];
    if (!hours?.open || !hours?.close) return false;
    const [oh, om] = hours.open.split(':').map(Number);
    const [ch, cm] = hours.close.split(':').map(Number);
    return localMinutes >= (oh * 60 + om) && localMinutes < (ch * 60 + cm);
  } catch { return false; }
}

interface SearchResult {
  pharmacy_id: string;
  drug_id: string;
  drug_name: string;
  drug_strength?: string;
  pharmacy_name: string;
  suburb: string;
  city: string;
  phone: string;
  whatsapp_number?: string;
  lat: number;
  lng: number;
  quantity: number;
  unit_price: number | null;
  stock_status: StockStatus;
  distance_km: number;
  is_open_now: boolean;
}

async function fetchNearbyPharmacies(
  drugQuery: string,
  city: string,
  userLat: number | null,
  userLng: number | null
): Promise<SearchResult[]> {
  if (!isSupabaseConfigured || !drugQuery.trim()) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const { data, error } = await supabase.rpc('find_nearby_pharmacies', {
      p_query:     drugQuery,
      p_lat:       userLat,
      p_lng:       userLng,
      p_radius_km: 50,
      p_city:      city,
    });

    clearTimeout(timeout);
    if (error) throw new Error(error.message);

    return (data || []).map((item: any): SearchResult => ({
      pharmacy_id:   item.pharmacy_id,
      drug_id:       item.drug_id,
      drug_name:     item.drug_name,
      drug_strength: item.drug_strength,
      pharmacy_name: item.pharmacy_name,
      suburb:        item.suburb,
      city:          item.city,
      phone:         item.phone ?? '',
      whatsapp_number: item.whatsapp_number ?? '',
      lat:           item.lat ?? item.latitude ?? 0,
      lng:           item.lng ?? item.longitude ?? 0,
      quantity:      item.quantity,
      unit_price:    item.unit_price,
      stock_status:  item.stock_status as StockStatus,
      distance_km:   item.distance_km ?? 0,
      is_open_now:   computeIsOpenNow(item.operating_hours, item.is_open_24h),
    }));
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === 'AbortError') {
      throw new Error('Search timed out — please check your connection and try again.');
    }
    throw err;
  }
}

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const drugQuery = searchParams.get('drug')  || '';
  const cityParam = searchParams.get('city')  || 'Harare';
  const latParam  = searchParams.get('lat');
  const lngParam  = searchParams.get('lng');

  const userLat = latParam ? parseFloat(latParam) : null;
  const userLng = lngParam ? parseFloat(lngParam) : null;

  const [viewMode, setViewMode]       = useState<'list' | 'map'>('list');
  const [sortBy, setSortBy]           = useState<'nearest' | 'price' | 'stock'>('stock');
  const [drugInfoOpen, setDrugInfoOpen] = useState(true);

  const {
    data: results = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<SearchResult[], Error>({
    queryKey:  ['pharmacy-search', drugQuery, cityParam, userLat, userLng],
    queryFn:   () => fetchNearbyPharmacies(drugQuery, cityParam, userLat, userLng),
    enabled:   !!drugQuery.trim(),
    staleTime: 1000 * 60 * 5,
    retry:     2,
    retryDelay: 1000,
  });

  const matchedDrugId = results[0]?.drug_id;

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      if (sortBy === 'nearest') return a.distance_km - b.distance_km;
      if (sortBy === 'price')   return (a.unit_price || 999) - (b.unit_price || 999);
      const order: Record<string, number> = { IN_STOCK: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 };
      return (order[a.stock_status] ?? 2) - (order[b.stock_status] ?? 2);
    });
  }, [results, sortBy]);

  const cheapestPrice = useMemo(() => {
    const prices = sorted
      .filter(r => r.unit_price != null && r.stock_status !== 'OUT_OF_STOCK')
      .map(r => r.unit_price!);
    return prices.length ? Math.min(...prices) : Infinity;
  }, [sorted]);

  const pagination = usePagination(sorted, { defaultPageSize: 10 });

  const handleSearch = useCallback((query: string) => {
    setSearchParams({ drug: query, city: cityParam });
    setDrugInfoOpen(true);
  }, [cityParam, setSearchParams]);

  const handleSmartSuggestion = useCallback((suggestion: string) => {
    setSearchParams({ drug: suggestion, city: cityParam });
    setDrugInfoOpen(true);
  }, [cityParam, setSearchParams]);

  const handleDetectLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) =>
      setSearchParams({
        drug: drugQuery,
        city: cityParam,
        lat:  pos.coords.latitude.toString(),
        lng:  pos.coords.longitude.toString(),
      })
    );
  }, [drugQuery, cityParam, setSearchParams]);

  const mapMarkers = useMemo(() => {
    // Deduplicate by pharmacy_id so we don't have overlapping markers
    const uniquePharmacies = new Map<string, any>();
    results.forEach(r => {
      if (!uniquePharmacies.has(r.pharmacy_id)) {
        uniquePharmacies.set(r.pharmacy_id, r);
      }
    });

    return Array.from(uniquePharmacies.values()).map(r => ({
      pharmacy_id:   r.pharmacy_id,
      pharmacy_name: r.pharmacy_name,
      lat:           r.lat,
      lng:           r.lng,
      suburb:        r.suburb,
      city:          r.city,
      stock_status:  r.stock_status,
      quantity:      r.quantity,
      unit_price:    r.unit_price,
    }));
  }, [results]);

  if (isError) {
    const msg = (error as Error)?.message || '';
    const isTimeout = msg.includes('timed out');
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="skeu-toolbar border-b py-3 px-4">
          <div className="container mx-auto">
            <DrugSearchBar variant="compact" initialQuery={drugQuery} onSearch={handleSearch} />
          </div>
        </div>
        <div className="container mx-auto px-4 py-12 max-w-lg">
          <div
            className="flex flex-col items-center text-center py-10 px-6 rounded-2xl border border-border"
            style={{ background: 'hsl(var(--card))', boxShadow: 'var(--shadow-card)' }}
          >
            <WifiOff className="w-12 h-12 text-muted-foreground/50 mb-5" />
            <h2 className="font-heading font-bold text-lg text-foreground mb-2">
              {isTimeout ? 'Search timed out' : 'Could not reach pharmacy network'}
            </h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {isTimeout
                ? 'The search took too long. Please try again.'
                : msg || 'An error occurred. Please check your connection.'}
            </p>
            <Button onClick={() => refetch()} className="gap-1.5">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <Navbar />

      <div className="skeu-toolbar border-b py-3 px-4">
        <div className="container mx-auto">
          <DrugSearchBar variant="compact" initialQuery={drugQuery} onSearch={handleSearch} />
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          <div className="flex-1 min-w-0">

            {drugQuery && (
              <div className="lg:hidden mb-4">
                <button
                  onClick={() => setDrugInfoOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    Drug information for &ldquo;{drugQuery}&rdquo;
                  </div>
                  {drugInfoOpen
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  }
                </button>
                {drugInfoOpen && (
                  <div className="mt-2">
                    <ErrorBoundary section="drug information">
                      <DrugInfoPanel
                        drugQuery={drugQuery}
                        drugId={matchedDrugId}
                        onClose={() => setDrugInfoOpen(false)}
                      />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h1 className="font-heading font-semibold text-lg text-foreground text-emboss pb-0.5">
                  {drugQuery ? `"${drugQuery}"` : 'Search results'} near {cityParam}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isLoading ? 'Searching…' : `${sorted.length} pharmacy${sorted.length !== 1 ? 'ies' : ''} found`}
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 sm:h-9 btn-skeu-outline gap-1.5 flex-1 sm:flex-none justify-center"
                  onClick={handleDetectLocation}
                >
                  <MapIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> Detect Location
                </Button>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="w-[140px] h-10 sm:h-9 btn-skeu-outline">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Best available</SelectItem>
                    <SelectItem value="nearest">Nearest first</SelectItem>
                    <SelectItem value="price">Lowest price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
              <div className="py-12">
                <LoadingSpinner size="lg" label="Searching pharmacies…" />
              </div>
            ) : sorted.length === 0 ? (
              <SmartEmptyState
                query={drugQuery}
                city={cityParam}
                onSearchSuggestion={handleSmartSuggestion}
              />
            ) : (
              <ErrorBoundary section="search results">
                <div className={`${viewMode === 'map' ? 'hidden' : 'block'} space-y-3`}>
                  {pagination.paginatedItems.map((result, index) => (
                    <PharmacyResultCard
                      key={`${result.pharmacy_id}-${result.drug_id ?? result.drug_name}-${index}`}
                      pharmacyId={result.pharmacy_id}
                      drugId={result.drug_id}
                      pharmacyName={result.pharmacy_name}
                      suburb={result.suburb}
                      city={result.city}
                      lat={result.lat}
                      lng={result.lng}
                      distanceKm={result.distance_km}
                      stockStatus={result.stock_status}
                      quantity={result.quantity}
                      unitPrice={result.unit_price}
                      phone={result.phone}
                      whatsappNumber={result.whatsapp_number}
                      drugName={result.drug_strength ? `${result.drug_name} ${result.drug_strength}` : result.drug_name}
                      isOpenNow={result.is_open_now ?? false}
                      isCheapest={result.unit_price === cheapestPrice && cheapestPrice !== Infinity}
                    />
                  ))}
                  <PaginationControls
                    page={pagination.page}         totalPages={pagination.totalPages}
                    canPrev={pagination.canPrev}   canNext={pagination.canNext}
                    onPrev={pagination.prevPage}   onNext={pagination.nextPage}
                    onPageChange={pagination.setPage}
                    startIndex={pagination.startIndex} endIndex={pagination.endIndex}
                    totalItems={pagination.totalItems}
                  />
                </div>
              </ErrorBoundary>
            )}

            {viewMode === 'map' && (
              <div className="h-[500px] lg:hidden mb-6 skeu-inset overflow-hidden">
                <ErrorBoundary section="map">
                  <PharmacyMap key={drugQuery} markers={mapMarkers} />
                </ErrorBoundary>
              </div>
            )}
          </div>

          <div className="hidden lg:flex lg:flex-col w-96 flex-shrink-0 gap-4">
            <div
              className="sticky top-20 flex flex-col gap-4"
              style={{ maxHeight: 'calc(100vh - 5.5rem)', overflow: 'hidden' }}
            >
              <div className="h-72 skeu-inset overflow-hidden border rounded-xl flex-shrink-0">
                <ErrorBoundary section="map">
                  <PharmacyMap key={drugQuery} markers={mapMarkers} />
                </ErrorBoundary>
              </div>
              {drugQuery && (
                <div
                  className="flex-1 overflow-y-auto rounded-xl"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}
                >
                  <ErrorBoundary section="drug information">
                    <DrugInfoPanel
                      drugQuery={drugQuery}
                      drugId={matchedDrugId}
                    />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Mobile Sticky Toggle Pill */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lg:hidden shadow-xl rounded-full bg-slate-900 border border-slate-700/50 flex items-center p-1.5 backdrop-blur-md">
        <button
          onClick={() => setViewMode('list')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors duration-200 ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'}`}
        >
          <List className="w-4 h-4" /> List
        </button>
        <button
          onClick={() => setViewMode('map')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors duration-200 ${viewMode === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'}`}
        >
          <MapIcon className="w-4 h-4" /> Map
        </button>
      </div>

    </div>
  );
};

export default SearchResultsPage;
