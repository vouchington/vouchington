'use client'

import { clientApi } from './instance'

export function getPaginatedPage<T>(
  endpoint: string,
  searchParams?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  return clientApi.get<T>(endpoint, { searchParams })
}
