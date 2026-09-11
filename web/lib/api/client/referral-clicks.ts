'use client'

import { clientApi } from './instance'
import type { ReferralClickLogResponseBody } from '@/types/api-responses'

export function getMyReferralClicksClient(after?: string): Promise<ReferralClickLogResponseBody> {
  return clientApi.get<ReferralClickLogResponseBody>('/api/v1/my/referral-clicks', {
    searchParams: after ? { after } : undefined,
  })
}
