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
