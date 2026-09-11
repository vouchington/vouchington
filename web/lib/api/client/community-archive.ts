import { clientApi } from './instance'
import type { CommunityArchiveResponseBody } from '@/types/api-responses'

export function archiveCommunity(idOrSlug: string): Promise<CommunityArchiveResponseBody> {
  return clientApi.patch<CommunityArchiveResponseBody>(`/api/v1/communities/${idOrSlug}`, {
    archive: true,
  })
}

export function unarchiveCommunity(idOrSlug: string): Promise<CommunityArchiveResponseBody> {
  return clientApi.patch<CommunityArchiveResponseBody>(`/api/v1/communities/${idOrSlug}`, {
    archive: false,
  })
}
