'use client'

import { clientApi } from './instance'
import type { MyBansResponse } from '@/types/my'

export function listMyBans(after?: string): Promise<MyBansResponse> {
  const params = after ? `?after=${encodeURIComponent(after)}` : ''
  return clientApi.get<MyBansResponse>(`/api/v1/my/bans${params}`)
}
