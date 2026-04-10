import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

interface StockStatusBadgeProps {
  status: StockStatus;
  quantity?: number;
}

export function StockStatusBadge({ status, quantity }: StockStatusBadgeProps) {
  switch (status) {
    case 'IN_STOCK':
      return (
        <span className="badge-in-stock">
          <CheckCircle className="w-3 h-3" />
          In Stock{quantity !== undefined && ` — ${quantity}`}
        </span>
      );
    case 'LOW_STOCK':
      return (
        <span className="badge-low-stock">
          <AlertTriangle className="w-3 h-3" />
          Low Stock{quantity !== undefined && ` — ${quantity}`}
        </span>
      );
    case 'OUT_OF_STOCK':
      return (
        <span className="badge-out-of-stock">
          <XCircle className="w-3 h-3" />
          Out of Stock
        </span>
      );
  }
}
