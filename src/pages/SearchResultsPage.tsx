import { useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { DrugSearchBar } from '@/components/DrugSearchBar';
import { PharmacyResultCard } from '@/components/PharmacyResultCard';
import { EmptyState } from '@/components/EmptyState';
import { searchStock } from '@/lib/mockData';
import { SearchX } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const drugQuery = searchParams.get('drug') || '';
  const cityParam = searchParams.get('city') || 'Harare';
  const [sortBy, setSortBy] = useState<'nearest' | 'price' | 'stock'>('stock');

  const results = searchStock(drugQuery, cityParam);

  const sorted = [...results].sort((a, b) => {
    if (sortBy === 'nearest') return a.distanceKm - b.distanceKm;
    if (sortBy === 'price') return (a.unit_price || 999) - (b.unit_price || 999);
    const statusOrder = { IN_STOCK: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 };
    return statusOrder[a.stockStatus] - statusOrder[b.stockStatus];
  });

  const handleSearch = (query: string) => {
    setSearchParams({ drug: query, city: cityParam });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Search bar */}
      <div className="border-b border-border bg-card py-3 px-4">
        <div className="container mx-auto">
          <DrugSearchBar variant="compact" initialQuery={drugQuery} onSearch={handleSearch} />
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Results */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h1 className="font-heading font-semibold text-lg text-foreground">
                  {drugQuery ? `"${drugQuery}"` : 'Search results'} near {cityParam}
                </h1>
                <p className="text-sm text-muted-foreground">{sorted.length} pharmacy{sorted.length !== 1 ? 'ies' : ''} found</p>
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Best availability</SelectItem>
                  <SelectItem value="nearest">Nearest first</SelectItem>
                  <SelectItem value="price">Lowest price</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sorted.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No pharmacies found"
                description={`No pharmacies found with "${drugQuery}" near ${cityParam}. Try a different spelling or check nearby cities.`}
              />
            ) : (
              <div className="space-y-3">
                {sorted.map((result) => (
                  <PharmacyResultCard
                    key={result.id}
                    pharmacyName={result.pharmacy.name}
                    suburb={result.pharmacy.suburb}
                    city={result.pharmacy.city}
                    distanceKm={result.distanceKm}
                    stockStatus={result.stockStatus}
                    quantity={result.quantity}
                    unitPrice={result.unit_price}
                    phone={result.pharmacy.phone}
                    isOpenNow={result.pharmacy.is_open_24h || Math.random() > 0.3}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Map placeholder */}
          <div className="hidden lg:block w-96 flex-shrink-0">
            <div className="sticky top-20 h-[calc(100vh-6rem)] rounded-lg bg-muted border border-border flex items-center justify-center">
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
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
        <span className="text-2xl">🗺️</span>
      </div>
      <p className="text-sm font-medium">Map View</p>
      <p className="text-xs">Connect Google Maps API to enable the interactive map</p>
    </div>
  );
}

export default SearchResultsPage;
