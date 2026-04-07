import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StockStatusBadge, type StockStatus } from '@/components/StockStatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AddEditDrugSheet, type StockFormData } from '@/components/AddEditDrugSheet';
import { ImportModal } from '@/components/ImportModal';
import { exportToCSV, exportToExcel } from '@/lib/exportUtils';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { toast } from 'sonner';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { useDebounce } from '@/hooks/use-debounce';
import { PaginationControls } from '@/components/PaginationControls';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Search, Pencil, Trash2, Upload, Download, FileSpreadsheet } from 'lucide-react';
import { syncManager } from '@/lib/syncManager';

interface StockItem {
  id: string;
  drug_id: string;
  drugName: string;
  common_name?: string;
  strength: string;
  form: string;
  quantity: number;
  unit_price: number;
  threshold: number;
  expiry_date: string;
  is_available: boolean;
  stock_status: StockStatus;
}

const StockManagementPage = () => {
  const { pharmacy, role, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | StockStatus>('ALL');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockFormData | null>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { page, pageSize, setPage, setPageSize, nextPage, prevPage, pageSizeOptions } = useServerPagination({ defaultPageSize: 20 });
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['stock', pharmacy?.id, debouncedSearch, filter, page, pageSize],
    queryFn: async () => {
      if (!pharmacy?.id) return { items: [], totalCount: 0 };
      
      let query = supabase
        .from('pharmacy_stock')
        .select(`
          id,
          drug_id,
          quantity,
          unit_price,
          threshold,
          expiry_date,
          is_available,
          drugs!inner (
            generic_name,
            common_name,
            strength,
            form
          )
        `, { count: 'exact' })
        .eq('pharmacy_id', pharmacy.id);

      // Status filters
      if (filter === 'OUT_OF_STOCK') {
        query = query.or('quantity.eq.0,is_available.eq.false');
      } else if (filter === 'LOW_STOCK') {
        query = query.filter('quantity', 'lte', 'threshold').eq('is_available', true).gt('quantity', 0);
      } else if (filter === 'IN_STOCK') {
        query = query.gt('quantity', 'threshold').eq('is_available', true);
      }

      // Search (Generic or Common Name)
      if (debouncedSearch) {
        query = query.or(`generic_name.ilike.%${debouncedSearch}%,common_name.ilike.%${debouncedSearch}%`, { foreignTable: 'drugs' });
      }

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data: stockData, error, count } = await query
        .range(from, to)
        .order('id', { ascending: false });
        
      if (error) throw error;
      
      const items = (stockData || []).map((s: any) => {
        const drug = s.drugs;
        const qty = s.quantity || 0;
        const thresh = s.threshold || 0;
        const avail = s.is_available;
        
        let stock_status: StockStatus = 'IN_STOCK';
        if (!avail || qty === 0) stock_status = 'OUT_OF_STOCK';
        else if (qty <= thresh) stock_status = 'LOW_STOCK';

        return {
          id: s.id,
          drug_id: s.drug_id,
          drugName: drug?.common_name || drug?.generic_name || 'Unknown Drug',
          common_name: drug?.common_name,
          strength: drug?.strength || '',
          form: drug?.form || '',
          quantity: qty,
          unit_price: s.unit_price || 0,
          threshold: thresh,
          expiry_date: s.expiry_date || '',
          is_available: avail,
          stock_status,
        };
      });

      return { items, totalCount: count || 0 };
    },
    enabled: !!pharmacy?.id && isSupabaseConfigured,
  });

  const stockItems = data?.items || [];
  const totalItems = data?.totalCount || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (role === 'pharmacy_staff') {
        const { error } = await supabase
          .from('pending_approvals')
          .insert([{
            pharmacy_id: pharmacy?.id,
            requester_id: user?.id,
            action_type: 'CREATE',
            table_name: 'pharmacy_stock',
            payload
          }]);
        if (error) throw error;
        toast.info('Request sent to admin for approval');
        return;
      }

      if (!navigator.onLine) {
        syncManager.enqueue('pharmacy_stock', 'INSERT', { ...payload, pharmacy_id: pharmacy?.id }, { userId: user?.id, pharmacyId: pharmacy?.id });
        return;
      }

      const { error } = await supabase
        .from('pharmacy_stock')
        .insert([{ ...payload, pharmacy_id: pharmacy?.id }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      if (role !== 'pharmacy_staff') toast.success('Drug added to inventory');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add drug');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ drugId, data }: { drugId: string; data: any }) => {
      if (role === 'pharmacy_staff') {
        const { error } = await supabase
          .from('pending_approvals')
          .insert([{
            pharmacy_id: pharmacy?.id,
            requester_id: user?.id,
            action_type: 'UPDATE',
            table_name: 'pharmacy_stock',
            target_id: drugId,
            payload: data
          }]);
        if (error) throw error;
        toast.info('Update request sent to admin');
        return;
      }

      if (!navigator.onLine) {
        syncManager.enqueue('pharmacy_stock', 'UPDATE', { id: drugId, ...data }, { userId: user?.id, pharmacyId: pharmacy?.id });
        return;
      }

      const { error } = await supabase
        .from('pharmacy_stock')
        .update(data)
        .eq('id', drugId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      if (role !== 'pharmacy_staff') toast.success('Drug updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update drug');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (drugId: string) => {
      if (role === 'pharmacy_staff') {
        const { error } = await supabase
          .from('pending_approvals')
          .insert([{
            pharmacy_id: pharmacy?.id,
            requester_id: user?.id,
            action_type: 'DELETE',
            table_name: 'pharmacy_stock',
            target_id: drugId,
            payload: {}
          }]);
        if (error) throw error;
        toast.info('Delete request sent to admin');
        return;
      }

      if (!navigator.onLine) {
        syncManager.enqueue('pharmacy_stock', 'DELETE', { id: drugId }, { userId: user?.id, pharmacyId: pharmacy?.id });
        return;
      }

      const { error } = await supabase
        .from('pharmacy_stock')
        .delete()
        .eq('id', drugId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      if (role !== 'pharmacy_staff') toast.success('Drug removed from inventory');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove drug');
    },
  });

  const handleAddDrug = (formData: StockFormData) => {
    addMutation.mutate({
      drug_id: formData.drugId,
      quantity: formData.quantity,
      unit_price: formData.unitPrice,
      threshold: formData.threshold,
      expiry_date: formData.expiryDate || null,
    });
  };

  const handleEditDrug = (formData: StockFormData) => {
    if (!editItemId) return;
    updateMutation.mutate({
      drugId: editItemId,
      data: {
        quantity: formData.quantity,
        unit_price: formData.unitPrice,
        threshold: formData.threshold,
        expiry_date: formData.expiryDate || null,
        is_available: formData.isAvailable,
      },
    });
    setEditItem(null);
    setEditItemId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId);
    setDeleteId(null);
  };

  const handleImport = async (rows: any[], setProgress: (p: number) => void) => {
    const CHUNK_SIZE = 1000;
    const total = rows.length;
    let processed = 0;

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const formatted = chunk.map(r => ({
        pharmacy_id: pharmacy?.id,
        drug_id: r.matchedDrugId, // Use the correct ID from matching
        quantity: r.quantity,
        unit_price: r.unit_price,
        threshold: r.threshold || 10,
        expiry_date: r.expiry_date || null,
        is_available: true
      }));

      const { error } = await supabase
        .from('pharmacy_stock')
        .upsert(formatted, { onConflict: 'pharmacy_id,drug_id' });

      if (error) {
        console.error('Import chunk error:', error);
        throw new Error(`Failed at row ${i + 1}: ${error.message}`);
      }

      processed += chunk.length;
      setProgress((processed / total) * 100);
    }
    
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    toast.success(`Successfully imported ${total} drugs`);
  };

  const handleExportCSV = () => {
    exportToCSV(stockItems, 'pharmtrack-stock');
    toast.success('Exported current page as CSV');
  };

  const handleExportExcel = () => {
    exportToExcel(stockItems, 'pharmtrack-stock');
    toast.success('Exported current page as Excel');
  };

  const openEdit = (item: StockItem) => {
    setEditItemId(item.id);
    setEditItem({
      drugId: item.drug_id,
      drugName: item.drugName,
      strength: item.strength,
      form: item.form,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      threshold: item.threshold,
      expiryDate: item.expiry_date,
      isAvailable: item.is_available,
    });
    setSheetOpen(true);
  };

  const openAdd = () => {
    setEditItem(null);
    setEditItemId(null);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Stock Management</h1>
        <Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add Drug</Button>
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
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className="text-xs"
            >
              {f === 'ALL' ? 'All' : f === 'IN_STOCK' ? 'In Stock' : f === 'LOW_STOCK' ? 'Low' : 'Out'}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8">
          <LoadingSpinner size="md" label="Loading inventory..." />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block skeu-inset overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border table-header-skeu">
                  <th className="text-left p-3 font-medium text-muted-foreground text-emboss">Drug Name</th>
                  <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Qty</th>
                  <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Price</th>
                  <th className="text-center p-3 font-medium text-muted-foreground text-emboss">Status</th>
                  <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stockItems.map(item => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors table-row-skeu">
                    <td className="p-3">
                      <p className="font-medium text-foreground">{item.drugName} <span className="font-mono-drug text-xs text-muted-foreground">{item.strength}</span></p>
                      <p className="text-xs text-muted-foreground">{item.form}{item.expiry_date ? ` · Exp: ${item.expiry_date}` : ''}</p>
                    </td>
                    <td className="p-3 text-right font-mono-drug text-foreground">{item.quantity}</td>
                    <td className="p-3 text-right font-mono-drug text-foreground">${item.unit_price.toFixed(2)}</td>
                    <td className="p-3 text-center"><StockStatusBadge status={item.stock_status} /></td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openEdit(item)}>
                          <Pencil className="w-3 h-3" /> Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {stockItems.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No drugs found matching your search</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {stockItems.map(item => (
              <div key={item.id} className="card-pharma">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{item.drugName} <span className="font-mono-drug text-xs text-muted-foreground">{item.strength}</span></p>
                    <p className="text-xs text-muted-foreground">{item.form}{item.expiry_date ? ` · Exp: ${item.expiry_date}` : ''}</p>
                  </div>
                  <StockStatusBadge status={item.stock_status} />
                </div>
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className="text-muted-foreground">Qty: <span className="font-mono-drug text-foreground">{item.quantity}</span></span>
                  <span className="font-mono-drug text-foreground">${item.unit_price.toFixed(2)}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openEdit(item)}>
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => setDeleteId(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <PaginationControls
            page={page} totalPages={totalPages}
            canPrev={page > 1} canNext={page < totalPages}
            onPrev={prevPage} onNext={nextPage}
            onPageChange={setPage}
            startIndex={(page - 1) * pageSize + 1} 
            endIndex={Math.min(page * pageSize, totalItems)}
            totalItems={totalItems}
            pageSize={pageSize} onPageSizeChange={setPageSize}
            pageSizeOptions={pageSizeOptions}
          />
        </>
      )}

      {/* Import / Export */}
      <div className="flex gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4 mr-2" /> Import
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleExportCSV}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportExcel}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Export as Excel (.xlsx)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-xs text-muted-foreground self-center">{totalItems} drug{totalItems !== 1 ? 's' : ''} total</span>
      </div>

      <AddEditDrugSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editData={editItem}
        onSave={editItem ? handleEditDrug : handleAddDrug}
      />

      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onConfirm={handleImport}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dialog-skeu">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground text-emboss">Remove Drug</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this drug from your inventory? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-gradient-to-b from-red-500 to-red-600 text-white border border-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StockManagementPage;
