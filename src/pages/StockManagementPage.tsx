import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { Plus, Search, Upload, Download } from 'lucide-react';
import { getStockStatus } from '@/lib/mockData';
import type { StockStatus } from '@/lib/mockData';

interface StockItem {
  id: string;
  drugName: string;
  strength: string;
  form: string;
  quantity: number;
  unitPrice: number;
  threshold: number;
  status: StockStatus;
}

const mockItems: StockItem[] = [
  { id: '1', drugName: 'Metformin', strength: '500mg', form: 'tablet', quantity: 45, unitPrice: 2.5, threshold: 10, status: 'IN_STOCK' },
  { id: '2', drugName: 'Amoxil', strength: '500mg', form: 'capsule', quantity: 8, unitPrice: 3.0, threshold: 10, status: 'LOW_STOCK' },
  { id: '3', drugName: 'Panadol', strength: '500mg', form: 'tablet', quantity: 0, unitPrice: 1.2, threshold: 20, status: 'OUT_OF_STOCK' },
  { id: '4', drugName: 'Amlodipine', strength: '5mg', form: 'tablet', quantity: 120, unitPrice: 4.0, threshold: 10, status: 'IN_STOCK' },
  { id: '5', drugName: 'Omeprazole', strength: '20mg', form: 'capsule', quantity: 6, unitPrice: 5.5, threshold: 10, status: 'LOW_STOCK' },
  { id: '6', drugName: 'Ventolin', strength: '100mcg', form: 'inhaler', quantity: 22, unitPrice: 12.0, threshold: 5, status: 'IN_STOCK' },
];

const StockManagementPage = () => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | StockStatus>('ALL');

  const filtered = mockItems.filter(item => {
    const matchesSearch = item.drugName.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'ALL' || item.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Stock Management</h1>
        <Button><Plus className="w-4 h-4 mr-2" /> Add Drug</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your stock..." className="pl-9 h-10" />
        </div>
        <div className="flex gap-1.5">
          {(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="text-xs"
            >
              {f === 'ALL' ? 'All' : f === 'IN_STOCK' ? 'In Stock' : f === 'LOW_STOCK' ? 'Low' : 'Out'}
            </Button>
          ))}
        </div>
      </div>

      {/* Desktop table — recessed surface */}
      <div className="hidden md:block skeu-inset overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b border-border"
              style={{
                background: 'linear-gradient(180deg, hsl(210 20% 95%) 0%, hsl(210 20% 91%) 100%)',
              }}
            >
              <th className="text-left p-3 font-medium text-muted-foreground text-emboss">Drug Name</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Qty</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Price</th>
              <th className="text-center p-3 font-medium text-muted-foreground text-emboss">Status</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors" style={{ background: 'hsl(0 0% 99%)' }}>
                <td className="p-3">
                  <p className="font-medium text-foreground">{item.drugName} <span className="font-mono-drug text-xs text-muted-foreground">{item.strength}</span></p>
                  <p className="text-xs text-muted-foreground">{item.form}</p>
                </td>
                <td className="p-3 text-right font-mono-drug">{item.quantity}</td>
                <td className="p-3 text-right font-mono-drug">${item.unitPrice.toFixed(2)}</td>
                <td className="p-3 text-center"><StockStatusBadge status={item.status} /></td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="outline" className="text-xs">Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map(item => (
          <div key={item.id} className="card-pharma">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-foreground">{item.drugName} <span className="font-mono-drug text-xs text-muted-foreground">{item.strength}</span></p>
                <p className="text-xs text-muted-foreground">{item.form}</p>
              </div>
              <StockStatusBadge status={item.status} />
            </div>
            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="text-muted-foreground">Qty: <span className="font-mono-drug text-foreground">{item.quantity}</span></span>
              <span className="font-mono-drug text-foreground">${item.unitPrice.toFixed(2)}</span>
              <Button size="sm" variant="outline" className="text-xs">Edit</Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" size="sm"><Upload className="w-4 h-4 mr-2" /> Import CSV</Button>
        <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
      </div>
    </div>
  );
};

export default StockManagementPage;
