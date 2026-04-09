import { useState } from 'react';
import { Phone, MapPin, Clock, MessageCircle, Send, Navigation, ShoppingBag } from 'lucide-react';
import { StockStatusBadge, type StockStatus } from './StockStatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { ReserveDrugModal } from './ReserveDrugModal';

interface PharmacyResultCardProps {
  pharmacyId: string;
  drugId?: string;
  pharmacyName: string;
  suburb: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number;
  stockStatus: StockStatus;
  quantity: number;
  unitPrice: number | null;
  phone: string;
  isOpenNow: boolean;
  drugName?: string;
  onHover?: () => void;
  /** Highlights this card as the cheapest option */
  isCheapest?: boolean;
}

export function PharmacyResultCard({
  pharmacyId,
  drugId,
  pharmacyName,
  suburb,
  city,
  lat,
  lng,
  distanceKm,
  stockStatus,
  quantity,
  unitPrice,
  phone,
  isOpenNow,
  drugName = 'this medicine',
  onHover,
  isCheapest = false,
}: PharmacyResultCardProps) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [senderContact, setSenderContact] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const whatsappNumber = phone.replace(/\s+/g, '').replace(/^0/, '263');
  const whatsappMessage = encodeURIComponent(`Hi ${pharmacyName}, I found you on PharmConnect Zim. Do you have ${drugName} in stock?`);
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  const handleRequest = async () => {
    if (!drugId || !pharmacyId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('drug_requests')
        .insert([{
          pharmacy_id: pharmacyId,
          drug_id: drugId,
          sender_name: senderName,
          sender_contact: senderContact,
        }]);

      if (error) throw error;
      
      // Also create a persistent notification for the pharmacy
      await supabase.from('notifications').insert([{
        pharmacy_id: pharmacyId,
        title: 'New Drug Request',
        message: `${senderName} is looking for ${drugName}. Contact: ${senderContact}`,
        type: 'REQUEST'
      }]);

      toast.success('Request sent successfully!');
      setRequestOpen(false);
      setSenderName('');
      setSenderContact('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        onMouseEnter={onHover}
        className="card-pharma-hover p-4"
        style={isCheapest ? {
          borderColor: 'hsl(45 90% 50%)',
          boxShadow: '0 0 0 2px hsl(45 90% 50% / 0.25), var(--shadow-card)',
        } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading font-semibold text-foreground truncate text-emboss">{pharmacyName}</h3>
              {isCheapest && (
                <Badge
                  className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                  style={{ background: 'hsl(45 95% 52%)', color: '#7a4f00', border: '1px solid hsl(45 80% 62%)' }}
                >
                  ⭐ Cheapest
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {suburb}, {city} · {distanceKm} km away
            </p>
          </div>
          <StockStatusBadge status={stockStatus} quantity={stockStatus !== 'OUT_OF_STOCK' ? quantity : undefined} />
        </div>

        <div className="flex items-center flex-wrap gap-4 mt-3 text-sm">
          {unitPrice !== null && (
            <span className="font-mono-drug price-tag-skeu">
              ${unitPrice.toFixed(2)}
            </span>
          )}
          <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary hover:underline">
            <Phone className="w-3 h-3" /> {phone}
          </a>
          <a 
            href={whatsappUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center gap-1 text-[#25D366] hover:underline font-medium"
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
          <a 
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-accent hover:underline font-medium"
          >
            <Navigation className="w-3.5 h-3.5" /> Directions
          </a>
          <span className={`flex items-center gap-1 ${isOpenNow ? 'text-accent' : 'text-muted-foreground'}`}>
            <Clock className="w-3 h-3" /> {isOpenNow ? 'Open Now' : 'Closed'}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1 btn-skeu-primary h-9"
            onClick={() => setReserveOpen(true)}
            disabled={stockStatus === 'OUT_OF_STOCK'}
          >
            <ShoppingBag className="w-3.5 h-3.5 mr-2" /> Reserve Drug
          </Button>
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button
              variant="outline"
              className="w-full h-9 border-accent/30 hover:bg-accent/5 text-accent"
            >
              <Navigation className="w-3.5 h-3.5 mr-2" /> Directions
            </Button>
          </a>
          <Button
            variant="ghost"
            className="px-3 h-9"
            onClick={() => setRequestOpen(true)}
            title="Request info"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <ReserveDrugModal
        isOpen={reserveOpen}
        onClose={() => setReserveOpen(false)}
        pharmacyId={pharmacyId}
        pharmacyName={pharmacyName}
        drugId={drugId}
        drugName={drugName}
        unitPrice={unitPrice}
      />

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request {drugName}</DialogTitle>
            <DialogDescription>
              We'll notify {pharmacyName} about your request. They will contact you when it's ready.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input 
                id="name" 
                value={senderName} 
                onChange={(e) => setSenderName(e.target.value)} 
                placeholder="e.g. Tendai" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Phone or Email</Label>
              <Input 
                id="contact" 
                value={senderContact} 
                onChange={(e) => setSenderContact(e.target.value)} 
                placeholder="07XX XXX XXX or name@example.com" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleRequest} 
              disabled={!senderName || !senderContact || isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

