'use client'

import { clientApi } from './instance'
import type { ModlogResponseBody } from '@/types/api-responses'

export function fetchCommunityModlog(
  idOrSlug: string,
  after?: string,
): Promise<ModlogResponseBody> {
  return clientApi.get<ModlogResponseBody>(`/api/v1/communities/${idOrSlug}/modlog`, {
    searchParams: { after },
  })
}

export function fetchAdminModlog(params?: {
  communityId?: string
  actorId?: string
  actionType?: string
  after?: string
}): Promise<ModlogResponseBody> {
  return clientApi.get<ModlogResponseBody>('/api/v1/admin/modlog', {
    searchParams: {
      community_id: params?.communityId,
      actor_id: params?.actorId,
      action_type: params?.actionType,
      after: params?.after,
    },
  })
}
