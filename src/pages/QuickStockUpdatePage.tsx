import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { 
  Plus, Search, Save, ArrowLeft, ArrowRight, ArrowDown, ArrowUp, 
  Zap, AlertCircle, Check, Loader2, Filter, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface StockRow {
  id: string;
  drug_id: string;
  drugName: string;
  strength: string;
  form: string;
  quantity: number;
  unit_price: number;
  threshold: number;
  expiry_date: string | null;
  is_available: boolean;
  // Local state fields
  isDirty?: boolean;
}

const QuickStockUpdatePage = () => {
  const { pharmacy, role, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [localData, setLocalData] = useState<StockRow[]>([]);
  const [originalData, setOriginalData] = useState<Record<string, StockRow>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['quick-stock', pharmacy?.id],
    queryFn: async () => {
      if (!pharmacy?.id) return [];
      const { data, error } = await supabase
        .from('pharmacy_stock')
        .select(`
          id,
          drug_id,
          quantity,
          unit_price,
          threshold,
          expiry_date,
          is_available,
          drugs!drug_id (
            generic_name,
            common_name,
            strength,
            form
          )
        `)
        .eq('pharmacy_id', pharmacy.id)
        .order('id', { ascending: false });
        
      if (error) throw error;
      
      return (data || []).map((s: any) => ({
        id: s.id,
        drug_id: s.drug_id,
        drugName: s.drugs?.common_name || s.drugs?.generic_name || 'Unknown',
        strength: s.drugs?.strength || '',
        form: s.drugs?.form || '',
        quantity: s.quantity || 0,
        unit_price: s.unit_price || 0,
        threshold: s.threshold || 0,
        expiry_date: s.expiry_date,
        is_available: s.is_available ?? true,
      }));
    },
    enabled: !!pharmacy?.id && isSupabaseConfigured,
  });

  useEffect(() => {
    if (data) {
      setLocalData(data);
      const original: Record<string, StockRow> = {};
      data.forEach(item => { original[item.id] = { ...item }; });
      setOriginalData(original);
    }
  }, [data]);

  const dirtyRows = localData.filter(row => {
    const orig = originalData[row.id];
    if (!orig) return false;
    return (
      row.quantity !== orig.quantity ||
      row.unit_price !== orig.unit_price ||
      row.threshold !== orig.threshold ||
      row.is_available !== orig.is_available
    );
  });

  const handleCellChange = (id: string, field: keyof StockRow, value: any) => {
    setLocalData(prev => prev.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const batchUpdateMutation = useMutation({
    mutationFn: async (rows: StockRow[]) => {
      if (role === 'pharmacy_staff') {
        // Staff submits to pending_approvals
        const requests = rows.map(row => ({
          pharmacy_id: pharmacy?.id,
          requester_id: user?.id,
          action_type: 'UPDATE',
          table_name: 'pharmacy_stock',
          target_id: row.id,
          payload: {
            quantity: row.quantity,
            unit_price: row.unit_price,
            threshold: row.threshold,
            is_available: row.is_available
          }
        }));
        const { error } = await supabase.from('pending_approvals').insert(requests);
        if (error) throw error;
        return { count: rows.length, toApproval: true };
      }

      // Admin updates directly
      const updates = rows.map(row => ({
        id: row.id,
        pharmacy_id: pharmacy?.id,
        drug_id: row.drug_id,
        quantity: row.quantity,
        unit_price: row.unit_price,
        threshold: row.threshold,
        is_available: row.is_available
      }));

      const { error } = await supabase
        .from('pharmacy_stock')
        .upsert(updates, { onConflict: 'id' });
        
      if (error) throw error;
      return { count: rows.length, toApproval: false };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['quick-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      setLastSaved(new Date());
      if (res.toApproval) {
        toast.success(`${res.count} changes submitted for approval`);
      } else {
        toast.success(`Successfully saved ${res.count} changes`);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save changes');
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, field: string) => {
    const input = e.target as HTMLInputElement;
    const { key } = e;

    if (key === 'Enter' || key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = tableRef.current?.querySelector(`tr[data-index="${rowIndex + 1}"] input[data-field="${field}"]`) as HTMLInputElement;
      nextInput?.focus();
      nextInput?.select();
    } else if (key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = tableRef.current?.querySelector(`tr[data-index="${rowIndex - 1}"] input[data-field="${field}"]`) as HTMLInputElement;
      prevInput?.focus();
      prevInput?.select();
    }
  };

  const filteredData = useMemo(() => {
    if (!search) return localData;
    const s = search.toLowerCase();
    return localData.filter(r => 
      r.drugName.toLowerCase().includes(s) || 
      r.strength.toLowerCase().includes(s) ||
      r.form.toLowerCase().includes(s)
    );
  }, [localData, search]);

  const getExpiryStatus = (dateStr: string | null) => {
    if (!dateStr) return null;
    const now = new Date();
    const expiry = new Date(dateStr);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { label: 'Expired', color: 'text-red-500 bg-red-500/10 border-red-500/20' };
    if (diffDays <= 30) return { label: `Exp in ${diffDays}d`, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    return null;
  };

  if (isLoading) {
    return (
      <div className="py-24">
        <LoadingSpinner size="lg" label="Initializing bulk editor..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/dashboard/stock" className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground mr-1">
                <ArrowLeft className="w-4 h-4" />
            </Link>
            <Zap className="w-5 h-5 text-amber-500" />
            <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Quick Update</h1>
          </div>
          <p className="text-muted-foreground text-sm pl-8">Spreadsheet-style bulk stock editor</p>
        </div>
        
        <div className="flex items-center gap-3">
          {lastSaved && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-100 animate-in fade-in zoom-in">
              <Check className="w-3 h-3" />
              Last saved {lastSaved.toLocaleTimeString()}
            </div>
          )}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Search drugs..." 
              className="pl-9 h-10 shadow-sm"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="skeu-inset overflow-hidden p-0 relative min-h-[500px] bg-card">
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-20 bg-background table-header-skeu border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider pl-6">Drug Information</th>
                <th className="text-center p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">Quantity</th>
                <th className="text-center p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">Price ($)</th>
                <th className="text-center p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">Low Alert</th>
                <th className="text-center p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">Available</th>
                <th className="text-center p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-40 pr-6">Status/Expiry</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, idx) => {
                const isDirty = dirtyRows.some(d => d.id === row.id);
                const expiry = getExpiryStatus(row.expiry_date);
                
                return (
                  <tr 
                    key={row.id} 
                    data-index={idx}
                    className={cn(
                      "group border-b border-border/50 transition-colors",
                      isDirty ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-muted/30"
                    )}
                  >
                    <td className="p-3 pl-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-1.5 h-10 rounded-full shrink-0 transition-all",
                          isDirty ? "bg-amber-400" : "bg-transparent group-hover:bg-muted-foreground/10"
                        )} />
                        <div>
                          <p className="font-bold text-foreground text-emboss">{row.drugName}</p>
                          <p className="text-xs text-muted-foreground font-mono-drug">{row.strength} · {row.form}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        data-field="quantity"
                        value={row.quantity}
                        onChange={(e) => handleCellChange(row.id, 'quantity', parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'quantity')}
                        className={cn(
                          "h-9 text-center font-mono-drug bg-transparent border-none focus-visible:ring-1 focus-visible:bg-background",
                          row.quantity <= row.threshold ? "text-red-600 font-bold" : "text-foreground"
                        )}
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        step="0.01"
                        data-field="unit_price"
                        value={row.unit_price}
                        onChange={(e) => handleCellChange(row.id, 'unit_price', parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'unit_price')}
                        className="h-9 text-center font-mono-drug bg-transparent border-none focus-visible:ring-1 focus-visible:bg-background"
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        data-field="threshold"
                        value={row.threshold}
                        onChange={(e) => handleCellChange(row.id, 'threshold', parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'threshold')}
                        className="h-9 text-center font-mono-drug bg-transparent border-none focus-visible:ring-1 focus-visible:bg-background text-muted-foreground"
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex justify-center">
                        <Switch 
                          checked={row.is_available}
                          onCheckedChange={(checked) => handleCellChange(row.id, 'is_available', checked)}
                        />
                      </div>
                    </td>
                    <td className="p-3 pr-6 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {expiry ? (
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 uppercase font-bold", expiry.color)}>
                            {expiry.label}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{row.expiry_date || '--'}</span>
                        )}
                        {isDirty && (
                          <span className="text-[10px] text-amber-600 font-bold flex items-center gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-amber-500" /> UNSAVED
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Filter className="w-12 h-12 opacity-10" />
                        <p>No drugs match your search filter</p>
                        <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear Search</Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky Save Bar */}
      {dirtyRows.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-full p-2 pl-6 flex items-center gap-6 backdrop-blur-md">
            <div className="flex flex-col">
              <span className="text-white text-sm font-bold">{dirtyRows.length} items modified</span>
              <span className="text-slate-400 text-[10px] uppercase tracking-wider">Unsaved changes in red/amber</span>
            </div>
            <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => refetch()} 
                  className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-full"
                >
                    Discard
                </Button>
                <Button 
                  onClick={() => batchUpdateMutation.mutate(dirtyRows)}
                  disabled={batchUpdateMutation.isPending}
                  className="rounded-full px-6 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 border-none shadow-lg h-10"
                >
                  {batchUpdateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickStockUpdatePage;
