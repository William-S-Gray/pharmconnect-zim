import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download } from 'lucide-react';

interface ExportDropdownProps {
  onCSV: () => void;
  onExcel: () => void;
  disabled?: boolean;
}

export const ExportDropdown = ({ onCSV, onExcel, disabled }: ExportDropdownProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" disabled={disabled}>
        <Download className="w-3.5 h-3.5 mr-1" /> Export
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={onCSV}>Export as CSV</DropdownMenuItem>
      <DropdownMenuItem onClick={onExcel}>Export as Excel</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
