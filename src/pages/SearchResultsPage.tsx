import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { DrugSearchBar } from '@/components/DrugSearchBar';
import { PharmacyResultCard } from '@/components/PharmacyResultCard';
import { SmartEmptyState } from '@/components/SmartEmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { DrugInfoPanel } from '@/components/DrugInfoPanel';
import { Map as MapIcon, List, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { type StockStatus } from '@/components/StockStatusBadge';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { PharmacyMap } from '@/components/PharmacyMap';

interface SearchResult {
  pharmacy_id: string;
  drug_id: string;
  pharmacy_name: string;
  suburb: string;
  city: string;
  phone: string;
  lat: number;
  lng: number;
  quantity: number;
  unit_price: number | null;
  stock_status: StockStatus;
  distance_km: number;
}

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const drugQuery = searchParams.get('drug') || '';
  const cityParam = searchParams.get('city') || 'Harare';
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [sortBy, setSortBy] = useState<'nearest' | 'price' | 'stock'>('stock');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchedDrugId, setMatchedDrugId] = useState<string | undefined>(undefined);
  const [drugInfoOpen, setDrugInfoOpen] = useState(true);

  useEffect(() => {
    if (!drugQuery) return;
    
    const fetchResults = async () => {
      if (!isSupabaseConfigured) return;
      
      setLoading(true);
      setMatchedDrugId(undefined);
      try {
        const { data: supabaseResults, error } = await supabase
          .from('pharmacy_stock')
          .select(`
            quantity,
            unit_price,
            threshold,
            is_available,
            drug_id,
            pharmacy:pharmacies!inner (
              id, name, suburb, city, lat, lng, phone, status
            ),
            drug:drugs!inner (
              id, generic_name, common_name, brand_names, search_terms
            )
          `)
          .eq('pharmacy.city', cityParam)
          .eq('pharmacy.status', 'APPROVED')
          .or(`generic_name.ilike.%${drugQuery}%,common_name.ilike.%${drugQuery}%,brand_names.cs.{${drugQuery}},search_terms.cs.{${drugQuery}}`, { foreignTable: 'drug' });

        if (error) throw error;

        const userLat = lat ? parseFloat(lat) : null;
        const userLng = lng ? parseFloat(lng) : null;

        let firstDrugId: string | undefined;

        const formatted: SearchResult[] = (supabaseResults || []).map((s: any) => {
          let distance = 0;
          if (userLat && userLng && s.pharmacy.lat && s.pharmacy.lng) {
            const R = 6371;
            const dLat = (s.pharmacy.lat - userLat) * Math.PI / 180;
            const dLng = (s.pharmacy.lng - userLng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(userLat * Math.PI / 180) * Math.cos(s.pharmacy.lat * Math.PI / 180) * 
                      Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            distance = Math.round(R * c * 10) / 10;
          }

          if (!firstDrugId && s.drug?.id) {
            firstDrugId = s.drug.id;
          }

          return {
            pharmacy_id: s.pharmacy.id,
            drug_id: s.drug?.id || s.drug_id,
            pharmacy_name: s.pharmacy.name,
            suburb: s.pharmacy.suburb,
            city: s.pharmacy.city,
            phone: s.pharmacy.phone,
            lat: s.pharmacy.lat,
            lng: s.pharmacy.lng,
            quantity: s.quantity,
            unit_price: s.unit_price,
            stock_status: s.quantity === 0 || !s.is_available ? 'OUT_OF_STOCK' : (s.quantity <= s.threshold ? 'LOW_STOCK' : 'IN_STOCK'),
            distance_km: distance,
          };
        });
        
        setResults(formatted);
        if (firstDrugId) setMatchedDrugId(firstDrugId);

        supabase.from('drug_searches').insert([{
          query: drugQuery,
          city: cityParam,
          result_count: formatted.length
        }]).then(({ error: e }) => {
          if (e) console.error('Analytics error:', e);
        });

      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
    setDrugInfoOpen(true);
  }, [drugQuery, cityParam, lat, lng]);

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      if (sortBy === 'nearest') return a.distance_km - b.distance_km;
      if (sortBy === 'price') return (a.unit_price || 999) - (b.unit_price || 999);
      const statusOrder: Record<string, number> = { IN_STOCK: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 };
      return (statusOrder[a.stock_status] ?? 2) - (statusOrder[b.stock_status] ?? 2);
    });
  }, [results, sortBy]);

  const pagination = usePagination(sorted, { defaultPageSize: 10 });

  const handleSearch = (query: string) => {
    setSearchParams({ drug: query, city: cityParam });
  };

  const handleSmartSuggestion = (suggestion: string) => {
    setSearchParams({ drug: suggestion, city: cityParam });
  };

  const mapMarkers = useMemo(() => results.map(r => ({
    pharmacy_id: r.pharmacy_id,
    pharmacy_name: r.pharmacy_name,
    lat: r.lat,
    lng: r.lng,
    suburb: r.suburb,
    city: r.city,
    stock_status: r.stock_status,
    quantity: r.quantity,
    unit_price: r.unit_price,
  })), [results]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="skeu-toolbar border-b py-3 px-4">
        <div className="container mx-auto">
          <DrugSearchBar variant="compact" initialQuery={drugQuery} onSearch={handleSearch} />
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Main results column ── */}
          <div className="flex-1 min-w-0">

            {/* Mobile: collapsible drug info banner */}
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
                    <DrugInfoPanel
                      drugQuery={drugQuery}
                      drugId={matchedDrugId}
                      onClose={() => setDrugInfoOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Results header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h1 className="font-heading font-semibold text-lg text-foreground text-emboss">
                  {drugQuery ? `"${drugQuery}"` : 'Search results'} near {cityParam}
                </h1>
                <p className="text-sm text-muted-foreground">{sorted.length} pharmacy{sorted.length !== 1 ? 'ies' : ''} found</p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 btn-skeu-outline gap-1.5"
                  onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition((pos) => {
                        setSearchParams({ 
                          drug: drugQuery, 
                          city: cityParam, 
                          lat: pos.coords.latitude.toString(), 
                          lng: pos.coords.longitude.toString() 
                        });
                      });
                    }
                  }}
                >
                  <MapIcon className="w-3.5 h-3.5" /> Detect My Location
                </Button>
                <div className="flex bg-muted p-1 rounded-lg mr-2 lg:hidden">
                  <Button 
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    onClick={() => setViewMode('list')}
                    className="h-8"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant={viewMode === 'map' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    onClick={() => setViewMode('map')}
                    className="h-8"
                  >
                    <MapIcon className="w-4 h-4" />
                  </Button>
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="w-36 h-9 btn-skeu-outline">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Best availability</SelectItem>
                    <SelectItem value="nearest">Nearest first</SelectItem>
                    <SelectItem value="price">Lowest price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loading ? (
              <div className="py-12">
                <LoadingSpinner size="lg" label="Searching pharmacies..." />
              </div>
            ) : sorted.length === 0 ? (
              <SmartEmptyState
                query={drugQuery}
                city={cityParam}
                onSearchSuggestion={handleSmartSuggestion}
              />
            ) : (
              <div className={`${viewMode === 'map' ? 'hidden' : 'block'} space-y-3`}>
                {pagination.paginatedItems.map((result) => {
                  const cheapestPrice = Math.min(
                    ...sorted
                      .filter(r => r.unit_price != null && r.stock_status !== 'OUT_OF_STOCK')
                      .map(r => r.unit_price!)
                  );
                  return (
                    <PharmacyResultCard
                      key={result.pharmacy_id}
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
                      drugName={drugQuery}
                      isOpenNow={true}
                      isCheapest={result.unit_price === cheapestPrice && cheapestPrice !== Infinity}
                    />
                  );
                })}
                <PaginationControls
                  page={pagination.page} totalPages={pagination.totalPages}
                  canPrev={pagination.canPrev} canNext={pagination.canNext}
                  onPrev={pagination.prevPage} onNext={pagination.nextPage}
                  onPageChange={pagination.setPage}
                  startIndex={pagination.startIndex} endIndex={pagination.endIndex}
                  totalItems={pagination.totalItems}
                />
              </div>
            )}
            
            {viewMode === 'map' && (
              <div className="h-[500px] lg:hidden mb-6 skeu-inset overflow-hidden">
                <PharmacyMap markers={mapMarkers} />
              </div>
            )}
          </div>

          {/* ── Desktop right sidebar: Map + Drug Info ── */}
          <div className="hidden lg:flex lg:flex-col w-96 flex-shrink-0 gap-4">
            <div
              className="sticky top-20 flex flex-col gap-4"
              style={{ maxHeight: 'calc(100vh - 5.5rem)', overflow: 'hidden' }}
            >
              {/* Map panel */}
              <div className="h-72 skeu-inset overflow-hidden border rounded-xl flex-shrink-0">
                <PharmacyMap markers={mapMarkers} />
              </div>

              {/* Drug info panel — scrollable */}
              {drugQuery && (
                <div
                  className="flex-1 overflow-y-auto rounded-xl"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}
                >
                  <DrugInfoPanel
                    drugQuery={drugQuery}
                    drugId={matchedDrugId}
                  />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SearchResultsPage;
