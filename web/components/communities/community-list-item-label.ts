import type {
  CommunityListItem,
  CommunityListItemType,
  CommunityListPageData,
} from '@/types/api-responses'

export function getCommunityListItemLabel(
  item: CommunityListItem,
  itemType: CommunityListItemType,
  data: CommunityListPageData,
): string {
  switch (itemType) {
    case 'topic': {
      return data.topics?.[item.entity_id]?.name ?? 'topic'
    }
    case 'rss_feed': {
      return data.rss_feeds?.[item.entity_id]?.title ?? 'source'
    }
    case 'post': {
      return data.posts?.[item.entity_id]?.title ?? 'post'
    }
    case 'url_hostname': {
      return data.url_hostnames?.[item.entity_id]?.hostname ?? 'domain'
    }
    case 'url': {
      return data.urls?.[item.entity_id]?.url ?? 'URL'
    }
  }
}
