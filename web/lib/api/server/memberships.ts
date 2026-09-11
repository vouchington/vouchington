import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { MembershipPlansResponseBody, MembershipResponseBody } from '@/types/api-responses'

export const getPlans = cache(
  (options?: { headers?: Record<string, string> }): Promise<MembershipPlansResponseBody> => {
    return serverApi.get<MembershipPlansResponseBody>('/api/v1/memberships/plans', options)
  },
)

export const getMembership = cache(
  async (options?: { headers?: Record<string, string> }): Promise<MembershipResponseBody> => {
    const result = await returnNullForMissingEntity(
      serverApi.get<MembershipResponseBody>('/api/v1/memberships/me', options),
    )
    return (
      result ?? {
        membership: null,
        sources: [],
        pending: { grants: 0, switches: [], verifications: [], financial_operations: [] },
        management: null,
      }
    )
  },
)
