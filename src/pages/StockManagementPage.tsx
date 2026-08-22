import { useState, useEffect, useRef } from 'react';
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
import { api } from '@/lib/api';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Search, Pencil, Trash2, Upload, Download, FileSpreadsheet, Zap } from 'lucide-react';
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
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { page, pageSize, setPage, setPageSize, nextPage, prevPage, pageSizeOptions } = useServerPagination({ defaultPageSize: 20 });
  const debouncedSearch = useDebounce(search, 300);

  // ── Real-time stock subscription ────────────────────────────────────────
  useEffect(() => {
    if (!pharmacy?.id) return;

    return api.subscribeToChanges(
      (event) => {
        if (event.pharmacy_id !== pharmacy.id) return;
        queryClient.invalidateQueries({ queryKey: ['stock', pharmacy.id] });

        // Flash the row that changed. The event carries its id, which is
        // all this needs — the refetched query supplies the contents.
        const changedId = event.id;
        if (changedId) {
          setFlashedIds(prev => new Set(prev).add(changedId));
          if (flashTimers.current[changedId]) clearTimeout(flashTimers.current[changedId]);
          flashTimers.current[changedId] = setTimeout(() => {
            setFlashedIds(prev => { const next = new Set(prev); next.delete(changedId); return next; });
          }, 2000);
        }
      },
      { tables: ['pharmacy_stock'] },
    );
  }, [pharmacy?.id, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ['stock', pharmacy?.id, debouncedSearch, filter, page, pageSize],
    queryFn: async () => {
      if (!pharmacy?.id) return { items: [], totalCount: 0 };

      // Filtering, searching, paging and the stock_status computation all
      // happen in SQL now. The version this replaces built a PostgREST
      // filter chain in the browser, including a `quantity <= threshold`
      // comparison expressed as a literal string.
      const response = await api.stock.list(pharmacy.id, {
        search: debouncedSearch || undefined,
        status: filter,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      const items = response.items.map((s) => ({
        id: s.id,
        drug_id: s.drug_id ?? '',
        drugName: s.drug_name,
        common_name: s.drug_name,
        strength: s.strength || '',
        form: s.form || '',
        quantity: s.quantity,
        unit_price: s.unit_price ?? 0,
        threshold: s.threshold,
        expiry_date: s.expiry_date || '',
        is_available: s.is_available,
        stock_status: s.stock_status as StockStatus,
      }));

      return { items, totalCount: response.total };
    },
    enabled: !!pharmacy?.id,
  });

  const stockItems = data?.items || [];
  const totalItems = data?.totalCount || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  /**
   * Whether the write was queued for approval rather than applied.
   *
   * Staff edits become pending_approvals rows; admin edits apply directly.
   * That decision is the server's — this used to be an `if (role === ...)`
   * branch here, which meant the rule lived in the browser and anyone
   * bypassing the UI simply wrote to the table.
   */
  const wasQueued = (result: unknown) =>
    !!result && typeof result === 'object' && 'pending' in (result as object);

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!navigator.onLine) {
        syncManager.enqueue('pharmacy_stock', 'INSERT', { ...payload }, { userId: user?.id, pharmacyId: pharmacy?.id });
        return null;
      }
      return api.stock.create(pharmacy!.id, payload);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      if (wasQueued(result)) toast.info('Request sent to admin for approval');
      else if (result) toast.success('Drug added to inventory');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to add drug'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ drugId, data }: { drugId: string; data: any }) => {
      if (!navigator.onLine) {
        syncManager.enqueue('pharmacy_stock', 'UPDATE', { id: drugId, ...data }, { userId: user?.id, pharmacyId: pharmacy?.id });
        return null;
      }
      return api.stock.update(pharmacy!.id, drugId, data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      if (wasQueued(result)) toast.info('Update request sent to admin');
      else if (result) toast.success('Drug updated');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update drug'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (drugId: string) => {
      if (!navigator.onLine) {
        syncManager.enqueue('pharmacy_stock', 'DELETE', { id: drugId }, { userId: user?.id, pharmacyId: pharmacy?.id });
        return null;
      }
      return api.stock.remove(pharmacy!.id, drugId);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      if (wasQueued(result)) toast.info('Delete request sent to admin');
      else toast.success('Drug removed from inventory');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to remove drug'),
  });

  const handleAddDrug = (formData: StockFormData) => {
    addMutation.mutate({
      drug_id: formData.drugId || null,
      drug_name: formData.drugName,
      strength: formData.strength || null,
      form: formData.form || null,
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
        drug_id: r.matchedDrugId || null,
        // drug_name is required and denormalised, so an imported row still
        // displays when it matches nothing in the catalogue.
        drug_name: r.drugName || r.drug_name || r.name || 'Unknown',
        strength: r.strength || null,
        form: r.form || null,
        quantity: r.quantity,
        unit_price: r.unit_price,
        threshold: r.threshold || 10,
        expiry_date: r.expiry_date || null,
        is_available: true,
      }));

      // One transaction per chunk on the server, so a chunk either lands
      // entirely or not at all.
      try {
        await api.stock.bulkImport(pharmacy!.id, formatted);
      } catch (err: any) {
        console.error('Import chunk error:', err);
        throw new Error(`Failed at row ${i + 1}: ${err.message}`);
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
        <div className="flex items-center gap-2">
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Stock Management</h1>
          <span
            className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full animate-pulse"
            style={{ background: 'hsl(142 70% 90%)', color: 'hsl(142 60% 30%)', border: '1px solid hsl(142 60% 70%)' }}
          >
            <Zap className="w-2.5 h-2.5" /> LIVE
          </span>
        </div>
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
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors table-row-skeu"
                    style={flashedIds.has(item.id) ? {
                      background: 'hsl(142 70% 92%)',
                      transition: 'background 0.5s ease',
                    } : undefined}
                  >
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
