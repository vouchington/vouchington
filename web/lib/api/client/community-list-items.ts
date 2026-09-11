'use client'
import { clientApi } from './instance'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'
import type { CommunityListItemType } from '@voucha/types/entities/community'

export function addCommunityListTopic(idOrSlug: string, topicId: string): Promise<void> {
  return addCommunityListItemByType(idOrSlug, 'topic', topicId)
}

export function addCommunityListRssFeed(idOrSlug: string, rssFeedId: string): Promise<void> {
  return addCommunityListItemByType(idOrSlug, 'rss_feed', rssFeedId)
}

export function addCommunityListPost(idOrSlug: string, postId: string): Promise<void> {
  return addCommunityListItemByType(idOrSlug, 'post', postId)
}

export function addCommunityListDomain(idOrSlug: string, urlHostnameId: string): Promise<void> {
  return addCommunityListItemByType(idOrSlug, 'url_hostname', urlHostnameId)
}

export function addCommunityListUrl(idOrSlug: string, urlId: string): Promise<void> {
  return addCommunityListItemByType(idOrSlug, 'url', urlId)
}

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
