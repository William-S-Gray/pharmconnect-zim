import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageChange: (page: number) => void;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function PaginationControls({
  page, totalPages, canPrev, canNext,
  onPrev, onNext, onPageChange,
  startIndex, endIndex, totalItems,
  pageSize, onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: PaginationControlsProps) {
  if (totalItems <= (pageSizeOptions[0] ?? 10) && totalPages <= 1) return null;

  // Generate page numbers to show
  const getPages = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {startIndex}–{endIndex} of {totalItems}
        </span>
        {onPageSizeChange && pageSize && (
          <>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1.5">
              <span>Show</span>
              <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!canPrev}
          onClick={() => onPageChange(1)}
          aria-label="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!canPrev}
          onClick={onPrev}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>

        <div className="flex items-center gap-0.5 mx-1">
          {getPages().map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-muted-foreground">…</span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8 text-xs"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            )
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!canNext}
          onClick={onNext}
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!canNext}
          onClick={() => onPageChange(totalPages)}
          aria-label="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
