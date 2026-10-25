'use client'

import {
  usePaginatedList as usePackagePaginatedList,
  type PaginatedData,
  type PaginatedListParams,
  type PaginatedPageFetcher,
} from '@vouchington/api-client/paginated-list'
import { getPaginatedPage } from '@/lib/api/client'

export type { PaginatedListParams }

interface UsePaginatedListOptions<T> {
  loadPage?: (after: string) => Promise<T>
  fetchPage?: PaginatedPageFetcher<T>
}

/** Cursor-page accumulation that continues through the app's paginated API client by default. */
export function usePaginatedList<T extends PaginatedData>(
  initialData: T,
  endpoint: string,
  params: PaginatedListParams,
  { loadPage, fetchPage }: UsePaginatedListOptions<T> = {},
) {
  return usePackagePaginatedList(initialData, endpoint, params, {
    ...(loadPage ? { loadPage } : {}),
    fetchPage:
      fetchPage ?? (loadPage ? undefined : (path, query) => getPaginatedPage<T>(path, query)),
  } as Parameters<typeof usePackagePaginatedList<T>>[3])
}
