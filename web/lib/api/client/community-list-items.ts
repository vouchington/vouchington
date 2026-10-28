'use client'
import { clientApi } from './instance'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'
import type { CommunityListItemType } from '@voucha/types/entities/community'

export function addCommunityListItemByType(
  idOrSlug: string,
  entityType: CommunityListItemType,
  entityId: string,
): Promise<void> {
  const config = communityListItemTypeCatalog[entityType]
  return clientApi.post(`/api/v1/communities/${idOrSlug}/list-items/${config.apiPathSegment}`, {
    [config.requestBodyIdField]: entityId,
  })
}

export function removeCommunityListItem(
  idOrSlug: string,
  entityType: CommunityListItemType,
  itemId: string,
): Promise<void> {
  const { apiPathSegment } = communityListItemTypeCatalog[entityType]
  return clientApi.delete(`/api/v1/communities/${idOrSlug}/list-items/${apiPathSegment}/${itemId}`)
}
