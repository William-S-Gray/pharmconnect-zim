import { useState, useCallback } from 'react';

interface UseServerPaginationOptions {
  defaultPageSize?: number;
}

interface UseServerPaginationReturn {
  page: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  pageSizeOptions: number[];
}

export function useServerPagination(options?: UseServerPaginationOptions): UseServerPaginationReturn {
  const [page, setPageInternal] = useState(1);
  const [pageSize, setPageSizeInternal] = useState(options?.defaultPageSize ?? 20);

  const setPage = useCallback((p: number) => {
    setPageInternal(Math.max(1, p));
  }, []);

  const setPageSize = useCallback((s: number) => {
    setPageSizeInternal(s);
    setPageInternal(1); // Reset to first page on size change
  }, []);

  const nextPage = useCallback(() => setPageInternal(prev => prev + 1), []);
  const prevPage = useCallback(() => setPageInternal(prev => Math.max(1, prev - 1)), []);

  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    nextPage,
    prevPage,
    pageSizeOptions: [10, 20, 50, 100],
  };
}
