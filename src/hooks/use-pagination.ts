import { useMemo, useState, useCallback } from 'react';

interface UsePaginationOptions {
  defaultPageSize?: number;
}

interface UsePaginationReturn<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  paginatedItems: T[];
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  canNext: boolean;
  canPrev: boolean;
  startIndex: number;
  endIndex: number;
  totalItems: number;
}

export function usePagination<T>(items: T[], options?: UsePaginationOptions): UsePaginationReturn<T> {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(options?.defaultPageSize ?? 10);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp page when items/filter change
  const clampedPage = Math.min(page, totalPages);
  if (clampedPage !== page) setPageRaw(clampedPage);

  const startIndex = (clampedPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  const setPage = useCallback((p: number) => setPageRaw(Math.max(1, Math.min(p, totalPages))), [totalPages]);
  const setPageSize = useCallback((s: number) => { setPageSizeRaw(s); setPageRaw(1); }, []);
  const nextPage = useCallback(() => setPage(clampedPage + 1), [clampedPage, setPage]);
  const prevPage = useCallback(() => setPage(clampedPage - 1), [clampedPage, setPage]);

  return {
    page: clampedPage,
    pageSize,
    totalPages,
    paginatedItems,
    setPage,
    setPageSize,
    nextPage,
    prevPage,
    canNext: clampedPage < totalPages,
    canPrev: clampedPage > 1,
    startIndex: startIndex + 1,
    endIndex,
    totalItems,
  };
}
