import { Phone, MapPin, Clock } from 'lucide-react';
import { StockStatusBadge } from './StockStatusBadge';
import type { StockStatus } from '@/lib/mockData';

interface PharmacyResultCardProps {
  pharmacyName: string;
  suburb: string;
  city: string;
  distanceKm: number;
  stockStatus: StockStatus;
  quantity: number;
  unitPrice: number | null;
  phone: string;
  isOpenNow: boolean;
  onHover?: () => void;
}

export function PharmacyResultCard({
  pharmacyName,
  suburb,
  city,
  distanceKm,
  stockStatus,
  quantity,
  unitPrice,
  phone,
  isOpenNow,
  onHover,
}: PharmacyResultCardProps) {
  return (
    <div
      onMouseEnter={onHover}
      className="card-pharma-hover p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-foreground truncate text-emboss">{pharmacyName}</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {suburb}, {city} · {distanceKm} km away
          </p>
        </div>
        <StockStatusBadge status={stockStatus} quantity={stockStatus !== 'OUT_OF_STOCK' ? quantity : undefined} />
      </div>

      <div className="flex items-center gap-4 mt-3 text-sm">
        {unitPrice !== null && (
          <span
            className="font-mono-drug font-medium px-2 py-0.5 rounded-md"
            style={{
              background: 'linear-gradient(180deg, hsl(210 20% 96%) 0%, hsl(210 20% 92%) 100%)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7)',
              border: '1px solid hsl(214 20% 85%)',
            }}
          >
            ${unitPrice.toFixed(2)}
          </span>
        )}
        <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary hover:underline">
          <Phone className="w-3 h-3" /> {phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')}
        </a>
        <span className={`flex items-center gap-1 ${isOpenNow ? 'text-accent' : 'text-muted-foreground'}`}>
          <Clock className="w-3 h-3" /> {isOpenNow ? 'Open Now' : 'Closed'}
        </span>
      </div>
    </div>
  );
}
