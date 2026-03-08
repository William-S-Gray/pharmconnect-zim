import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StockStatusBadge } from '@/components/StockStatusBadge';
import { Plus, Search, Upload, Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import { getStockStatus } from '@/lib/mockData';
import type { StockStatus } from '@/lib/mockData';
import { AddEditDrugSheet, type StockFormData } from '@/components/AddEditDrugSheet';
import { ImportModal } from '@/components/ImportModal';
import { exportToCSV, exportToExcel } from '@/lib/exportUtils';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface StockItem {
  id: string;
  drugId: string;
  drugName: string;
  strength: string;
  form: string;
  quantity: number;
  unitPrice: number;
  threshold: number;
  expiryDate: string;
  isAvailable: boolean;
  status: StockStatus;
}

const initialItems: StockItem[] = [
  { id: '1', drugId: '2', drugName: 'Metformin', strength: '500mg', form: 'tablet', quantity: 45, unitPrice: 2.5, threshold: 10, expiryDate: '2025-12-01', isAvailable: true, status: 'IN_STOCK' },
  { id: '2', drugId: '3', drugName: 'Amoxil', strength: '500mg', form: 'capsule', quantity: 8, unitPrice: 3.0, threshold: 10, expiryDate: '2025-09-01', isAvailable: true, status: 'LOW_STOCK' },
  { id: '3', drugId: '1', drugName: 'Panadol', strength: '500mg', form: 'tablet', quantity: 0, unitPrice: 1.2, threshold: 20, expiryDate: '', isAvailable: false, status: 'OUT_OF_STOCK' },
  { id: '4', drugId: '4', drugName: 'Amlodipine', strength: '5mg', form: 'tablet', quantity: 120, unitPrice: 4.0, threshold: 10, expiryDate: '2026-06-01', isAvailable: true, status: 'IN_STOCK' },
  { id: '5', drugId: '5', drugName: 'Omeprazole', strength: '20mg', form: 'capsule', quantity: 6, unitPrice: 5.5, threshold: 10, expiryDate: '2025-11-15', isAvailable: true, status: 'LOW_STOCK' },
  { id: '6', drugId: '10', drugName: 'Ventolin', strength: '100mcg', form: 'inhaler', quantity: 22, unitPrice: 12.0, threshold: 5, expiryDate: '2026-08-01', isAvailable: true, status: 'IN_STOCK' },
];

const StockManagementPage = () => {
  const [items, setItems] = useState<StockItem[]>(initialItems);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | StockStatus>('ALL');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockFormData | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = items.filter(item => {
    const matchesSearch = item.drugName.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'ALL' || item.status === filter;
    return matchesSearch && matchesFilter;
  });

  const handleAddDrug = (data: StockFormData) => {
    setLoading(true);
    setTimeout(() => {
      const status = getStockStatus(data.quantity, data.threshold, data.isAvailable);
      const newItem: StockItem = {
        id: Date.now().toString(),
        drugId: data.drugId,
        drugName: data.drugName,
        strength: data.strength,
        form: data.form,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        threshold: data.threshold,
        expiryDate: data.expiryDate,
        isAvailable: data.isAvailable,
        status,
      };
      setItems(prev => [...prev, newItem]);
      setLoading(false);
      toast.success(`${data.drugName} added to inventory`);
    }, 600);
  };

  const handleEditDrug = (data: StockFormData) => {
    setLoading(true);
    setTimeout(() => {
      const status = getStockStatus(data.quantity, data.threshold, data.isAvailable);
      setItems(prev => prev.map(item =>
        item.drugId === data.drugId
          ? { ...item, quantity: data.quantity, unitPrice: data.unitPrice, threshold: data.threshold, expiryDate: data.expiryDate, isAvailable: data.isAvailable, status }
          : item
      ));
      setEditItem(null);
      setLoading(false);
      toast.success(`${data.drugName} updated`);
    }, 600);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setItems(prev => prev.filter(item => item.id !== deleteId));
    setDeleteId(null);
    toast.success('Drug removed from inventory');
  };

  const handleImport = (rows: { drug_name: string; quantity: number; unit_price: number; threshold: number }[]) => {
    setLoading(true);
    setTimeout(() => {
      const newItems: StockItem[] = rows.map((row, i) => {
        const status = getStockStatus(row.quantity, row.threshold, true);
        return {
          id: `imp-${Date.now()}-${i}`,
          drugId: '',
          drugName: row.drug_name,
          strength: '',
          form: '',
          quantity: row.quantity,
          unitPrice: row.unit_price,
          threshold: row.threshold,
          expiryDate: '',
          isAvailable: true,
          status,
        };
      });
      setItems(prev => [...prev, ...newItems]);
      setLoading(false);
      toast.success(`${rows.length} drug(s) imported`);
    }, 800);
  };

  const handleExportCSV = () => {
    exportToCSV(filtered, 'pharmtrack-stock');
    toast.success('Exported as CSV');
  };

  const handleExportExcel = () => {
    exportToExcel(filtered, 'pharmtrack-stock');
    toast.success('Exported as Excel');
  };

  const openEdit = (item: StockItem) => {
    setEditItem({
      drugId: item.drugId,
      drugName: item.drugName,
      strength: item.strength,
      form: item.form,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      threshold: item.threshold,
      expiryDate: item.expiryDate,
      isAvailable: item.isAvailable,
    });
    setSheetOpen(true);
  };

  const openAdd = () => {
    setEditItem(null);
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
              onClick={() => setFilter(f)}
              className="text-xs"
            >
              {f === 'ALL' ? 'All' : f === 'IN_STOCK' ? 'In Stock' : f === 'LOW_STOCK' ? 'Low' : 'Out'}
            </Button>
          ))}
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="py-8">
          <LoadingSpinner size="md" label="Updating inventory..." />
        </div>
      )}

      {/* Desktop table */}
      {!loading && (
        <>
          <div className="hidden md:block skeu-inset overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'linear-gradient(180deg, hsl(210 20% 95%) 0%, hsl(210 20% 91%) 100%)' }} className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground text-emboss">Drug Name</th>
                  <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Qty</th>
                  <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Price</th>
                  <th className="text-center p-3 font-medium text-muted-foreground text-emboss">Status</th>
                  <th className="text-right p-3 font-medium text-muted-foreground text-emboss">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors" style={{ background: 'hsl(0 0% 99%)' }}>
                    <td className="p-3">
                      <p className="font-medium text-foreground">{item.drugName} <span className="font-mono-drug text-xs text-muted-foreground">{item.strength}</span></p>
                      <p className="text-xs text-muted-foreground">{item.form}{item.expiryDate ? ` · Exp: ${item.expiryDate}` : ''}</p>
                    </td>
                    <td className="p-3 text-right font-mono-drug">{item.quantity}</td>
                    <td className="p-3 text-right font-mono-drug">${item.unitPrice.toFixed(2)}</td>
                    <td className="p-3 text-center"><StockStatusBadge status={item.status} /></td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => openEdit(item)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-xs text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No drugs match your search</td></tr>
                )}
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
                    <p className="text-xs text-muted-foreground">{item.form}{item.expiryDate ? ` · Exp: ${item.expiryDate}` : ''}</p>
                  </div>
                  <StockStatusBadge status={item.status} />
                </div>
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className="text-muted-foreground">Qty: <span className="font-mono-drug text-foreground">{item.quantity}</span></span>
                  <span className="font-mono-drug text-foreground">${item.unitPrice.toFixed(2)}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => openEdit(item)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => setDeleteId(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Import / Export buttons */}
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
        <span className="text-xs text-muted-foreground self-center">{filtered.length} drug{filtered.length !== 1 ? 's' : ''} shown</span>
      </div>

      {/* Sheets & Modals */}
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent style={{
          background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 20% 96%) 100%)',
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-emboss">Remove Drug</AlertDialogTitle>
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
