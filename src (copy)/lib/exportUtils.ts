import * as XLSX from 'xlsx';

interface ExportItem {
  drugName?: string;
  common_name?: string;
  strength: string;
  form: string;
  quantity: number;
  unitPrice?: number;
  unit_price?: number;
  threshold: number;
  status?: string;
  stock_status?: string;
}

function buildExportData(items: ExportItem[]) {
  return items.map(item => ({
    'Drug Name': item.drugName || item.common_name || '',
    'Strength': item.strength,
    'Form': item.form,
    'Quantity': item.quantity,
    'Unit Price (USD)': item.unitPrice ?? item.unit_price ?? 0,
    'Reorder Threshold': item.threshold,
    'Status': (item.status || item.stock_status || '').replace('_', ' '),
  }));
}

export function exportToCSV(items: ExportItem[], filename = 'stock-export') {
  const data = buildExportData(items);
  const headers = Object.keys(data[0] || {});
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const val = row[h as keyof typeof row];
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportToExcel(items: ExportItem[], filename = 'stock-export') {
  const data = buildExportData(items);
  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
