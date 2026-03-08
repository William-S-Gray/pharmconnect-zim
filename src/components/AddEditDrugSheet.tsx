import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Search, Save } from 'lucide-react';
import { searchDrugs, mockDrugs, type Drug } from '@/lib/mockData';
import type { StockStatus } from '@/lib/mockData';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';

export interface StockFormData {
  drugId: string;
  drugName: string;
  strength: string;
  form: string;
  quantity: number;
  unitPrice: number;
  threshold: number;
  expiryDate: string;
  isAvailable: boolean;
}

interface AddEditDrugSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: StockFormData | null;
  onSave: (data: StockFormData) => void;
}

export function AddEditDrugSheet({ open, onOpenChange, editData, onSave }: AddEditDrugSheetProps) {
  const isEdit = !!editData;
  const [drugSearch, setDrugSearch] = useState('');
  const [drugResults, setDrugResults] = useState<Drug[]>([]);
  const [showDrugList, setShowDrugList] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [form, setForm] = useState<StockFormData>({
    drugId: '', drugName: '', strength: '', form: '',
    quantity: 0, unitPrice: 0, threshold: 10,
    expiryDate: '', isAvailable: true,
  });
  const debounceRef = useRef<NodeJS.Timeout>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editData) {
      setForm(editData);
      setSelectedDrug(mockDrugs.find(d => d.id === editData.drugId) || null);
      setDrugSearch('');
    } else {
      setForm({
        drugId: '', drugName: '', strength: '', form: '',
        quantity: 0, unitPrice: 0, threshold: 10,
        expiryDate: '', isAvailable: true,
      });
      setSelectedDrug(null);
      setDrugSearch('');
    }
  }, [editData, open]);

  const handleDrugSearch = (value: string) => {
    setDrugSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const found = searchDrugs(value);
      setDrugResults(found);
      setShowDrugList(found.length > 0);
    }, 300);
  };

  const handleSelectDrug = (drug: Drug) => {
    setSelectedDrug(drug);
    setShowDrugList(false);
    setDrugSearch('');
    setForm(prev => ({
      ...prev,
      drugId: drug.id,
      drugName: drug.common_name,
      strength: drug.strength,
      form: drug.form,
    }));
  };

  const handleSave = () => {
    if (!form.drugName) return;
    onSave(form);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" style={{
        background: 'linear-gradient(180deg, hsl(0 0% 99%) 0%, hsl(210 20% 95%) 100%)',
      }}>
        <SheetHeader>
          <SheetTitle className="text-emboss">{isEdit ? 'Edit Drug Stock' : 'Add Drug to Inventory'}</SheetTitle>
          <SheetDescription>
            {isEdit ? 'Update the stock details below' : 'Search for a drug and set your stock levels'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Drug selector */}
          {!isEdit && (
            <div ref={wrapperRef} className="relative">
              <Label>Search Drug</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={drugSearch}
                  onChange={(e) => handleDrugSearch(e.target.value)}
                  placeholder="Type drug name..."
                  className="pl-9"
                  onFocus={() => drugResults.length > 0 && setShowDrugList(true)}
                />
              </div>
              {showDrugList && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border overflow-hidden z-50 max-h-48 overflow-y-auto" style={{
                  background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 20% 97%) 100%)',
                  boxShadow: 'var(--shadow-elevated)',
                }}>
                  {drugResults.map(drug => (
                    <button
                      key={drug.id}
                      onClick={() => handleSelectDrug(drug)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors border-b border-border last:border-0"
                    >
                      <span className="font-medium">{drug.common_name}</span>
                      <span className="text-xs text-muted-foreground ml-1">{drug.strength} · {drug.form}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected drug info */}
          {(selectedDrug || isEdit) && (
            <div className="card-pharma p-3">
              <p className="font-heading font-semibold text-sm text-foreground text-emboss">
                {form.drugName} <span className="font-mono-drug text-xs text-muted-foreground">{form.strength}</span>
              </p>
              <p className="text-xs text-muted-foreground">{selectedDrug?.generic_name || ''} · {form.form}</p>
            </div>
          )}

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantity in Stock *</Label>
              <Input
                id="qty"
                type="number"
                min={0}
                value={form.quantity}
                onChange={(e) => setForm(prev => ({ ...prev, quantity: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Unit Price (USD)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step={0.01}
                value={form.unitPrice}
                onChange={(e) => setForm(prev => ({ ...prev, unitPrice: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="threshold">Reorder Threshold *</Label>
              <Input
                id="threshold"
                type="number"
                min={1}
                value={form.threshold}
                onChange={(e) => setForm(prev => ({ ...prev, threshold: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiry">Expiry Date</Label>
              <Input
                id="expiry"
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm(prev => ({ ...prev, expiryDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 py-1">
            <Switch
              checked={form.isAvailable}
              onCheckedChange={(v) => setForm(prev => ({ ...prev, isAvailable: v }))}
              id="available"
            />
            <Label htmlFor="available" className="cursor-pointer">Available for search</Label>
          </div>

          <Button onClick={handleSave} className="w-full gap-2" disabled={!form.drugName}>
            <Save className="w-4 h-4" />
            {isEdit ? 'Save Changes' : 'Add to Inventory'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
