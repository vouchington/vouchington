'use client'

import type { CopyrightEuDisputeSettlementsPage } from '@/types/copyright-eu'
import { clientApi } from './instance'

export function listCopyrightEuDisputeSettlements(
  noticeId: string,
  options: { after?: string; limit?: number } = {},
): Promise<CopyrightEuDisputeSettlementsPage> {
  return clientApi.get(`/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements`, {
    searchParams: { after: options.after, limit: options.limit },
  })
}
