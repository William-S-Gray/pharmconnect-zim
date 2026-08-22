import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Phone, MessageCircle, MapPin, Clock, Search, ArrowLeft, Share2, Navigation, ShoppingBag, ShieldCheck, Zap, Pill } from 'lucide-react';
import { toast } from 'sonner';
import { StockStatusBadge, type StockStatus } from '@/components/StockStatusBadge';
import { ReserveDrugModal } from '@/components/ReserveDrugModal';
import { GoogleMap, useJsApiLoader, MarkerF, type Libraries } from '@react-google-maps/api';
import { cn } from '@/lib/utils';

// Typed as the loader's own Libraries type. The hand-written union
// included "localContext", which @react-google-maps/api dropped.
const GOOGLE_MAPS_LIBRARIES: Libraries = ['places'];

function computeIsOpenNow(operatingHours: any, isOpen24h: boolean): boolean {
  if (isOpen24h) return true;
  if (!operatingHours) return false;
  try {
    const now = new Date();
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

const mapContainerStyle = {
  width: '100%',
  height: '250px',
  borderRadius: '0.75rem',
};

const PublicPharmacyPage = () => {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<any>(null);
  const [reserveOpen, setReserveOpen] = useState(false);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const { data: pharmacy, isLoading: pharmaLoading } = useQuery({
    queryKey: ['public-pharmacy', id],
    queryFn: async () => {
      // One request returns the pharmacy and its public stock together.
      // The endpoint only serves approved, active pharmacies and exposes a
      // fixed column list, so an unapproved pharmacy's details are not
      // reachable here even by guessing the id.
      return api.pharmacies.getPublic(id!);
    },
    enabled: !!id,
  });

  const stock = pharmacy?.stock ?? [];

  const filteredStock = useMemo(() => {
    if (!search) return stock;
    const s = search.toLowerCase();
    // drug_name is denormalised onto the stock row, so there is no nested
    // drugs object to reach through any more.
    return stock.filter((item: any) => item.drug_name?.toLowerCase().includes(s));
  }, [stock, search]);

  const isOpen = useMemo(() => {
    if (!pharmacy) return false;
    return computeIsOpenNow(pharmacy.operating_hours, pharmacy.is_open_24h);
  }, [pharmacy]);

  const handleShare = async () => {
    try {
      await navigator.share({
        title: pharmacy?.name,
        url: window.location.href
      });
    } catch {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Profile link copied!');
    }
  };

  if (pharmaLoading) {
    return <div className="h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }

  if (!pharmacy) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-2">Pharmacy Not Found</h1>
        <Button asChild><Link to="/">Return to Search</Link></Button>
      </div>
    );
  }

  const whatsappNumber = (pharmacy.whatsapp_number || pharmacy.phone || '').replace(/\s+/g, '').replace(/^0/, '263');
  const whatsappUrl = `https://wa.me/${whatsappNumber}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${pharmacy.lat},${pharmacy.lng}`;

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      
      {/* Header / Hero */}
      <div className="bg-primary/5 border-b border-primary/10 pt-8 pb-12">
        <div className="container mx-auto px-4 max-w-5xl">
          <Link to="/search" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Back to search
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground text-emboss">{pharmacy.name}</h1>
                <Badge className={cn("px-3 py-1", isOpen ? "bg-accent text-white" : "bg-muted text-muted-foreground")}>
                  {isOpen ? 'Open Now' : 'Closed'}
                </Badge>
                {(pharmacy as any).mcaz_license && (
                    <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 gap-1">
                        <ShieldCheck className="w-3 h-3" /> MCAZ Verified
                    </Badge>
                )}
              </div>
              
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 text-primary" />
                  {pharmacy.address}, {pharmacy.suburb}, {pharmacy.city}
                </p>
                <div className="flex items-center gap-4 flex-wrap">
                    <a href={`tel:${pharmacy.phone}`} className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                        <Phone className="w-4 h-4" /> {pharmacy.phone}
                    </a>
                    <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-[#25D366] hover:opacity-80 transition-colors">
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                    </a>
                </div>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
               <Button onClick={handleShare} variant="outline" className="rounded-full shadow-sm"><Share2 className="w-4 h-4 mr-2" /> Share</Button>
               <Button asChild className="rounded-full btn-skeu-primary px-6 shadow-lg"><a href={directionsUrl} target="_blank" rel="noreferrer"><Navigation className="w-4 h-4 mr-2" /> Directions</a></Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-12">
        <div className="grid lg:grid-cols-[1fr_320px] gap-12">
          
          {/* Main Content: Drug List */}
          <div className="space-y-8">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-primary" />
                  Available Medications
                </h2>
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      value={search} 
                      onChange={e => setSearch(e.target.value)} 
                      placeholder="Search drugs here..." 
                      className="pl-9 h-10 shadow-sm"
                    />
                </div>
              </div>

              <div className="skeu-inset rounded-2xl overflow-hidden border">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="text-left p-4 font-semibold text-muted-foreground pl-6">Drug Name</th>
                                <th className="text-center p-4 font-semibold text-muted-foreground">Status</th>
                                <th className="text-right p-4 font-semibold text-muted-foreground">Price</th>
                                <th className="text-right p-4 font-semibold text-muted-foreground pr-6">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {filteredStock.map((item: any) => {
                                const d = item.drugs;
                                let status: StockStatus = 'IN_STOCK';
                                if (item.quantity === 0) status = 'OUT_OF_STOCK';
                                else if (item.quantity <= item.threshold) status = 'LOW_STOCK';

                                return (
                                    <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                                        <td className="p-4 pl-6">
                                            <p className="font-bold text-foreground">{d.common_name || d.generic_name}</p>
                                            <p className="text-[11px] text-muted-foreground uppercase font-mono-drug">{d.strength} · {d.form}</p>
                                        </td>
                                        <td className="p-4 text-center">
                                            <StockStatusBadge status={status} />
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className="font-mono-drug font-bold text-accent">${item.unit_price.toFixed(2)}</span>
                                        </td>
                                        <td className="p-4 text-right pr-6">
                                            <Button 
                                              size="sm" 
                                              variant="outline" 
                                              className="h-8 text-xs btn-skeu-outline"
                                              onClick={() => {
                                                setSelectedDrug(item);
                                                setReserveOpen(true);
                                              }}
                                            >
                                                Reserve
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredStock.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center text-muted-foreground italic">
                                        No medications found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar: Hours & Map */}
          <div className="space-y-8">
            <div className="card-pharma shadow-lg border-primary/10">
              <h3 className="font-heading font-bold text-lg mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Operating Hours
              </h3>
              <div className="space-y-3">
                {days.map(day => {
                  const h = pharmacy.operating_hours?.[day];
                  const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() === day;
                  
                  return (
                    <div key={day} className={cn(
                        "flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0",
                        isToday ? "font-bold text-primary" : "text-muted-foreground"
                    )}>
                      <span className="capitalize">{day}</span>
                      <span>{h ? `${h.open} - ${h.close}` : 'Closed'}</span>
                    </div>
                  );
                })}
              </div>
              {pharmacy.is_open_24h && (
                  <div className="mt-4 p-3 bg-accent/5 rounded-lg border border-accent/10 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-accent" />
                      <span className="text-xs font-bold text-accent uppercase">Open 24 Hours</span>
                  </div>
              )}
            </div>

            <div className="card-pharma shadow-lg p-3">
              <h3 className="font-heading font-bold text-sm mb-3 pl-1 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Location
              </h3>
              {isLoaded && pharmacy.lat && pharmacy.lng ? (
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={{ lat: pharmacy.lat, lng: pharmacy.lng }}
                  zoom={15}
                  options={{ disableDefaultUI: true }}
                >
                  <MarkerF position={{ lat: pharmacy.lat, lng: pharmacy.lng }} />
                </GoogleMap>
              ) : (
                <div className="bg-muted animate-pulse rounded-xl h-40 flex items-center justify-center text-xs text-muted-foreground">
                    Map preview unavailable
                </div>
              )}
              <Button asChild variant="ghost" size="sm" className="w-full mt-3 text-xs text-primary transition-all">
                <a href={directionsUrl} target="_blank" rel="noreferrer">Open in Google Maps →</a>
              </Button>
            </div>
            
            <div className="text-center space-y-2 pt-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Pill className="w-5 h-5 text-primary" />
                </div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Verified Pharmacy Profile</p>
                <p className="text-[10px] text-muted-foreground px-4">Found this pharmacy on PharmConnect Zim. Connecting healthcare to communities.</p>
            </div>
          </div>

        </div>
      </div>

      {selectedDrug && (
         <ReserveDrugModal
            isOpen={reserveOpen}
            onClose={() => setReserveOpen(false)}
            pharmacyId={pharmacy.id}
            pharmacyName={pharmacy.name}
            drugId={selectedDrug.drugs.id}
            drugName={selectedDrug.drugs.common_name || selectedDrug.drugs.generic_name}
            unitPrice={selectedDrug.unit_price}
         />
      )}
    </div>
  );
};

export default PublicPharmacyPage;
