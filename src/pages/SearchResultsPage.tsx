import { useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { DrugSearchBar } from '@/components/DrugSearchBar';
import { PharmacyResultCard } from '@/components/PharmacyResultCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SearchX } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import type { StockStatus } from '@/lib/mockData';

interface SearchResult {
  pharmacy_id: string;
  pharmacy_name: string;
  suburb: string;
  city: string;
  phone: string;
  lat: number;
  lng: number;
  quantity: number;
  unit_price: number;
  stock_status: StockStatus;
  distance_km: number;
  common_name: string;
  strength: string;
}

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const drugQuery = searchParams.get('drug') || '';
  const cityParam = searchParams.get('city') || 'Harare';
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const [sortBy, setSortBy] = useState<'nearest' | 'price' | 'stock'>('stock');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!drugQuery) return;
    const fetchResults = async () => {
      try {
        setLoading(true);
        const params: Record<string, string> = { drug: drugQuery, city: cityParam };
        if (lat) params.lat = lat;
        if (lng) params.lng = lng;
        const res = await api.get('/api/search', { params });
        setResults(res.data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [drugQuery, cityParam, lat, lng]);

  const sorted = [...results].sort((a, b) => {
    if (sortBy === 'nearest') return a.distance_km - b.distance_km;
    if (sortBy === 'price') return (a.unit_price || 999) - (b.unit_price || 999);
    const statusOrder: Record<string, number> = { IN_STOCK: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 };
    return (statusOrder[a.stock_status] ?? 2) - (statusOrder[b.stock_status] ?? 2);
  });

  const handleSearch = (query: string) => {
    setSearchParams({ drug: query, city: cityParam });
  };

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
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h1 className="font-heading font-semibold text-lg text-foreground text-emboss">
                  {drugQuery ? `"${drugQuery}"` : 'Search results'} near {cityParam}
                </h1>
                <p className="text-sm text-muted-foreground">{sorted.length} pharmacy{sorted.length !== 1 ? 'ies' : ''} found</p>
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

            {loading ? (
              <div className="py-12">
                <LoadingSpinner size="lg" label="Searching pharmacies..." />
              </div>
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No pharmacies found"
                description={`No pharmacies found with "${drugQuery}" near ${cityParam}. Try a different spelling or check nearby cities.`}
              />
            ) : (
              <div className="space-y-3">
                {sorted.map((result) => (
                  <PharmacyResultCard
                    key={result.pharmacy_id}
                    pharmacyName={result.pharmacy_name}
                    suburb={result.suburb}
                    city={result.city}
                    distanceKm={result.distance_km}
                    stockStatus={result.stock_status}
                    quantity={result.quantity}
                    unitPrice={result.unit_price}
                    phone={result.phone}
                    isOpenNow={true}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="hidden lg:block w-96 flex-shrink-0">
            <div className="sticky top-20 h-[calc(100vh-6rem)] rounded-xl flex items-center justify-center skeu-inset">
              <div className="text-center text-muted-foreground p-4">
                <MapPlaceholder />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function MapPlaceholder() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center map-icon-skeu">
        <span className="text-2xl">🗺️</span>
      </div>
      <p className="text-sm font-medium text-foreground">Map View</p>
      <p className="text-xs text-muted-foreground">Connect Google Maps API to enable the interactive map</p>
    </div>
  );
}

export default SearchResultsPage;
