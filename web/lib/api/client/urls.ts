'use client'

/**
 * URLs API methods
 */

import { clientApi } from './instance'
import type { UrlListResponseBody } from '@/types/api-responses'
import {
  emptyUrlListResponse,
  isUrlSearchQueryBelowMinLength,
  normalizeUrlSearchQuery,
} from '../url-query-min-length'

interface FetchUrlsOptions {
  query?: string
  limit?: number
  signal?: AbortSignal
}

/**
 * Search URLs by query string
 * GET /api/v1/urls
 *
 * The backend requires query.length >= 3 (after trim). Short-circuit here so
 * callers never hit a 400 — see backend/services/urls/search.mts.
 */
export async function fetchUrls(options: FetchUrlsOptions = {}): Promise<UrlListResponseBody> {
  if (isUrlSearchQueryBelowMinLength(options.query)) {
    return emptyUrlListResponse()
  }
  return clientApi.get<UrlListResponseBody>('/api/v1/urls', {
    searchParams: {
      query: normalizeUrlSearchQuery(options.query),
      limit: options.limit,
    },
    signal: options.signal,
  })
}
