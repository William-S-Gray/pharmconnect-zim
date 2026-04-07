import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, AlertCircle, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ImportRow {
  drug_name: string;
  quantity: number;
  unit_price: number;
  threshold: number;
  matched: boolean;
  matchedDrugId?: string;
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rows: ImportRow[], setProgress: (p: number) => void) => Promise<void>;
}

function fuzzyMatchDrug(name: string, masterDrugs: any[]): { matched: boolean; drugId?: string } {
  const q = name.toLowerCase().trim();
  const drug = masterDrugs.find(d =>
    d.common_name?.toLowerCase().includes(q) ||
    d.generic_name?.toLowerCase().includes(q) ||
    (d.brand_names && d.brand_names.some((b: string) => b.toLowerCase().includes(q))) ||
    (d.search_terms && d.search_terms.some((t: string) => t.includes(q)))
  );
  return drug ? { matched: true, drugId: drug.id } : { matched: false };
}

function parseFileData(data: string[][], masterDrugs: any[]): ImportRow[] {
  const header = data[0]?.map(h => h?.toString().toLowerCase().trim()) || [];
  const nameIdx = header.findIndex(h => h?.includes('drug') || h?.includes('name') || h?.includes('medicine'));
  const qtyIdx = header.findIndex(h => h?.includes('qty') || h?.includes('quantity') || h?.includes('stock'));
  const priceIdx = header.findIndex(h => h?.includes('price') || h?.includes('cost'));
  const threshIdx = header.findIndex(h => h?.includes('threshold') || h?.includes('reorder'));

  return data.slice(1).filter(row => row[nameIdx >= 0 ? nameIdx : 0]).map(row => {
    const drugName = row[nameIdx >= 0 ? nameIdx : 0]?.toString() || '';
    const match = fuzzyMatchDrug(drugName, masterDrugs);
    return {
      drug_name: drugName,
      quantity: Number(row[qtyIdx >= 0 ? qtyIdx : 1]) || 0,
      unit_price: Number(row[priceIdx >= 0 ? priceIdx : 2]) || 0,
      threshold: Number(row[threshIdx >= 0 ? threshIdx : 3]) || 10,
      matched: match.matched,
      matchedDrugId: match.drugId,
    };
  });
}

export function ImportModal({ open, onOpenChange, onConfirm }: ImportModalProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setFileName(file.name);

    try {
      // Fetch master drugs for fuzzy matching
      const { data: masterDrugs } = await supabase
        .from('drugs')
        .select('id, generic_name, common_name, brand_names, search_terms');

      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
        setRows(parseFileData(lines, masterDrugs || []));
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        setRows(parseFileData(data, masterDrugs || []));
      }
    } catch {
      setRows([]);
    }
    setLoading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleConfirm = async () => {
    setIsImporting(true);
    setProgress(0);
    try {
      await onConfirm(rows.filter(r => r.matched), (p) => setProgress(p));
      onOpenChange(false);
      setRows([]);
      setFileName('');
    } catch (error: any) {
      toast.error(error.message || "Import failed");
    } finally {
      setIsImporting(false);
      setProgress(0);
    }
  };

  const matchedCount = rows.filter(r => r.matched).length;
  const unmatchedCount = rows.filter(r => !r.matched).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" style={{
        background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 20% 96%) 100%)',
      }}>
        <DialogHeader>
          <DialogTitle className="text-emboss">Import Stock Data</DialogTitle>
          <DialogDescription>Upload a CSV or Excel (.xlsx) file with columns: drug_name, quantity, unit_price, threshold</DialogDescription>
        </DialogHeader>

        {rows.length === 0 && !loading && (
          <div
            className="skeu-inset rounded-xl p-8 text-center cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'linear-gradient(180deg, hsl(174 40% 94%) 0%, hsl(174 30% 88%) 100%)',
                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.05), 0 2px 6px rgba(0,0,0,0.08)',
                border: '1px solid hsl(174 20% 82%)',
              }}
            >
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <p className="font-medium text-foreground text-emboss mb-1">Drop your file here or click to browse</p>
            <p className="text-xs text-muted-foreground">Supports .csv, .xlsx, .xls files</p>
            <div className="flex gap-2 justify-center mt-4">
              <span className="badge-approved text-[10px]"><FileSpreadsheet className="w-3 h-3" /> CSV</span>
              <span className="badge-approved text-[10px]"><FileSpreadsheet className="w-3 h-3" /> Excel</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}

        {loading && (
          <div className="py-12">
            <LoadingSpinner size="lg" label="Processing file..." />
          </div>
        )}

        {rows.length > 0 && !loading && (
          <>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-sm text-muted-foreground">File: <strong className="text-foreground">{fileName}</strong></span>
              <span className="badge-approved text-[10px]"><Check className="w-3 h-3" /> {matchedCount} matched</span>
              {unmatchedCount > 0 && (
                <span className="badge-out-of-stock text-[10px]"><AlertCircle className="w-3 h-3" /> {unmatchedCount} unmatched</span>
              )}
            </div>

            <div className="skeu-inset overflow-hidden rounded-lg max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'linear-gradient(180deg, hsl(210 20% 95%) 0%, hsl(210 20% 91%) 100%)' }} className="border-b border-border">
                    <th className="text-left p-2 font-medium text-muted-foreground text-emboss">Drug</th>
                    <th className="text-right p-2 font-medium text-muted-foreground text-emboss">Qty</th>
                    <th className="text-right p-2 font-medium text-muted-foreground text-emboss">Price</th>
                    <th className="text-center p-2 font-medium text-muted-foreground text-emboss">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row, i) => (
                    <tr key={i} className={`border-b border-border last:border-0 ${!row.matched ? 'bg-destructive/5' : ''}`} style={row.matched ? { background: 'hsl(0 0% 99%)' } : {}}>
                      <td className="p-2 font-medium">{row.drug_name}</td>
                      <td className="p-2 text-right font-mono-drug">{row.quantity}</td>
                      <td className="p-2 text-right font-mono-drug">${row.unit_price.toFixed(2)}</td>
                      <td className="p-2 text-center">
                        {row.matched
                          ? <Check className="w-4 h-4 text-accent mx-auto" />
                          : <AlertCircle className="w-4 h-4 text-destructive mx-auto" />
                        }
                      </td>
                    </tr>
                  ))}
                  {rows.length > 100 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground italic">
                        ... and {rows.length - 100} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {isImporting && (
              <div className="mt-6 space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">Importing data...</span>
                  <span className="text-primary">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => { setRows([]); setFileName(''); }} disabled={isImporting}>
                Choose Different File
              </Button>
              <Button onClick={handleConfirm} disabled={matchedCount === 0 || isImporting}>
                {isImporting ? 'Importing...' : `Import ${matchedCount} Drug${matchedCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
