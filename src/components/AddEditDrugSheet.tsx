import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Search, Save, PlusCircle } from 'lucide-react';
import api from '@/lib/api';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Suggestion {
  id: string;
  common_name: string;
  generic_name: string;
  strength: string;
  form: string;
}

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

const DRUG_FORMS = ['tablet', 'capsule', 'syrup', 'injection', 'inhaler', 'cream', 'ointment', 'drops', 'suspension', 'powder'];

export function AddEditDrugSheet({ open, onOpenChange, editData, onSave }: AddEditDrugSheetProps) {
  const isEdit = !!editData;
  const [mode, setMode] = useState<'search' | 'custom'>('search');
  const [drugSearch, setDrugSearch] = useState('');
  const [drugResults, setDrugResults] = useState<Suggestion[]>([]);
  const [showDrugList, setShowDrugList] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<Suggestion | null>(null);
  const [form, setForm] = useState<StockFormData>({
    drugId: '', drugName: '', strength: '', form: '',
    quantity: 0, unitPrice: 0, threshold: 10,
    expiryDate: '', isAvailable: true,
  });
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (editData) {
      setForm(editData);
      setSelectedDrug(null);
      setDrugSearch('');
      setMode('search');
    } else {
      setForm({
        drugId: '', drugName: '', strength: '', form: '',
        quantity: 0, unitPrice: 0, threshold: 10,
        expiryDate: '', isAvailable: true,
      });
      setSelectedDrug(null);
      setDrugSearch('');
      setMode('search');
    }
  }, [editData, open]);

  const handleDrugSearch = (value: string) => {
    setDrugSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setDrugResults([]);
      setShowDrugList(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/api/search/autocomplete', { params: { q: value } });
        const suggestions: Suggestion[] = res.data.suggestions || [];
        setDrugResults(suggestions);
        setShowDrugList(suggestions.length > 0);
      } catch {
        setDrugResults([]);
        setShowDrugList(false);
      }
    }, 300);
  };

  const handleSelectDrug = (drug: Suggestion) => {
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

  const switchToCustom = () => {
    setMode('custom');
    setSelectedDrug(null);
    setShowDrugList(false);
    setForm(prev => ({
      ...prev,
      drugId: `custom-${Date.now()}`,
      drugName: drugSearch || '',
      strength: '',
      form: '',
    }));
  };

  const handleSave = () => {
    if (!form.drugName) return;
    onSave(form);
    onOpenChange(false);
  };

  const drugSelected = selectedDrug || mode === 'custom' && form.drugName;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" style={{
        background: 'linear-gradient(180deg, hsl(0 0% 99%) 0%, hsl(210 20% 95%) 100%)',
      }}>
        <SheetHeader>
          <SheetTitle className="text-emboss">{isEdit ? 'Edit Drug Stock' : 'Add Drug to Inventory'}</SheetTitle>
          <SheetDescription>
            {isEdit ? 'Update the stock details below' : 'Search existing drugs or add a completely new one'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {!isEdit && mode === 'search' && (
            <div className="relative">
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

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-2 text-xs"
                onClick={switchToCustom}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Drug not listed? Add a new drug manually
              </Button>
            </div>
          )}

          {!isEdit && mode === 'custom' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-primary">New Custom Drug</Label>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setMode('search'); setForm(prev => ({ ...prev, drugId: '', drugName: '', strength: '', form: '' })); }}>
                  ← Back to search
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customName">Drug Name *</Label>
                <Input
                  id="customName"
                  value={form.drugName}
                  onChange={(e) => setForm(prev => ({ ...prev, drugName: e.target.value }))}
                  placeholder="e.g. Ibuprofen"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="customStrength">Strength *</Label>
                  <Input
                    id="customStrength"
                    value={form.strength}
                    onChange={(e) => setForm(prev => ({ ...prev, strength: e.target.value }))}
                    placeholder="e.g. 400mg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Form *</Label>
                  <Select value={form.form} onValueChange={(v) => setForm(prev => ({ ...prev, form: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                    <SelectContent>
                      {DRUG_FORMS.map(f => (
                        <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {(selectedDrug || isEdit) && (
            <div className="card-pharma p-3">
              <p className="font-heading font-semibold text-sm text-foreground text-emboss">
                {form.drugName} <span className="font-mono-drug text-xs text-muted-foreground">{form.strength}</span>
              </p>
              <p className="text-xs text-muted-foreground">{selectedDrug?.generic_name || ''} · {form.form}</p>
            </div>
          )}

          {(drugSelected || isEdit) && (
            <>
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

              <Button onClick={handleSave} className="w-full gap-2" disabled={!form.drugName || (!isEdit && mode === 'custom' && (!form.strength || !form.form))}>
                <Save className="w-4 h-4" />
                {isEdit ? 'Save Changes' : 'Add to Inventory'}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
