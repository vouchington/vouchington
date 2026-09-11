'use client'

import { clientApi } from './instance'
import type {
  BlockHostnameResult,
  CreateHostnameResponse,
  HostnameListResponse,
} from '@/types/hostnames'

interface FetchHostnamesOptions {
  q?: string
  limit?: number
  after?: string
  signal?: AbortSignal
}

interface UpdateHostnameChanges {
  blocked?: boolean
  crawlable?: boolean
  link_rel_follow?: boolean
}

export async function fetchHostnames(
  options: FetchHostnamesOptions = {},
): Promise<HostnameListResponse> {
  return clientApi.get<HostnameListResponse>('/api/v1/hostnames', {
    searchParams: {
      query: options.q,
      limit: options.limit,
      after: options.after,
    },
    signal: options.signal,
  })
}

export async function updateHostname(
  id: string,
  changes: UpdateHostnameChanges,
): Promise<BlockHostnameResult | null> {
  if (changes.blocked === true) {
    return clientApi.patch<BlockHostnameResult>(`/api/v1/hostnames/${id}`, changes)
  }
  await clientApi.patch<void>(`/api/v1/hostnames/${id}`, changes)
  return null
}

export async function createHostname(input: {
  hostname: string
  blocked?: boolean
}): Promise<CreateHostnameResponse> {
  return clientApi.post<CreateHostnameResponse>('/api/v1/hostnames', input)
}
