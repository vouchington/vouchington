import {
  community,
  communityMetrics,
  pageInfo,
  post,
  rssFeed,
  timestamp,
  topic,
  user,
} from './data.mts'
import { communityMember, communityOwner } from './web-community-member-data.mts'

export { community, communityMetrics, pageInfo, rssFeed, timestamp, topic, user }

export const communitySearchBody = {
  results: [{ __entity_type: 'community', id: community.id }],
  page_info: pageInfo,
  communities: { [community.id]: community },
  users: { [communityOwner.id]: communityOwner },
  community_metrics: { [community.id]: communityMetrics },
  community_memberships: { [community.id]: communityMember },
  pending_application_community_ids: [],
  bookmarks: { [community.id]: { follow: true, save: false } },
}

export const archivedCommunity = {
  ...community,
  archived_at: '2026-06-01T00:00:00Z',
  archived_by_id: user.id,
  updated_at: '2026-06-01T00:00:00Z',
}

function createCommunityListItem({
  id,
  item_type,
  entity_id,
}: {
  id: string
  item_type: 'topic' | 'rss_feed' | 'post' | 'url_hostname' | 'url'
  entity_id: string
}) {
  return {
    __entity_type: 'community_list_item',
    id,
    community_id: community.id,
    item_type,
    entity_id,
    added_by_id: user.id,
    order_index: 0,
    created_at: timestamp,
  }
}

export const communityTopicListItem = createCommunityListItem({
  id: 'list-item-topic',
  item_type: 'topic',
  entity_id: topic.id,
})

export const communityRssFeedListItem = createCommunityListItem({
  id: 'list-item-rss-feed',
  item_type: 'rss_feed',
  entity_id: rssFeed.id,
})

export const communityPostListItem = createCommunityListItem({
  id: 'list-item-post',
  item_type: 'post',
  entity_id: 'post-1',
})

export const communityDomainListItem = createCommunityListItem({
  id: 'list-item-domain',
  item_type: 'url_hostname',
  entity_id: 'hostname-1',
})

export const communityUrlListItem = createCommunityListItem({
  id: 'list-item-url',
  item_type: 'url',
  entity_id: 'url-1',
})

export const communityTopicListItemPage = {
  results: [{ __entity_type: 'community_list_item', id: communityTopicListItem.id }],
  page_info: pageInfo,
  community_list_items: { [communityTopicListItem.id]: communityTopicListItem },
}

export const communityRssFeedListItemPage = {
  results: [{ __entity_type: 'community_list_item', id: communityRssFeedListItem.id }],
  page_info: pageInfo,
  community_list_items: { [communityRssFeedListItem.id]: communityRssFeedListItem },
}

export const communityPostListItemPage = {
  results: [{ __entity_type: 'community_list_item', id: communityPostListItem.id }],
  page_info: pageInfo,
  community_list_items: { [communityPostListItem.id]: communityPostListItem },
}

export const communityDomainListItemPage = {
  results: [{ __entity_type: 'community_list_item', id: communityDomainListItem.id }],
  page_info: pageInfo,
  community_list_items: { [communityDomainListItem.id]: communityDomainListItem },
}

export const communityUrlListItemPage = {
  results: [{ __entity_type: 'community_list_item', id: communityUrlListItem.id }],
  page_info: pageInfo,
  community_list_items: { [communityUrlListItem.id]: communityUrlListItem },
}
export const communityPost = {
  ...post,
  id: 'post-1',
  slug: 'fixture-post',
  post_type: 'discussion',
  title: 'Fixture post',
  markdown: 'Hello from the community.',
  community_id: community.id,
  created_by_id: user.id,
  updated_by_id: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  locked_at: null,
  locked_by_id: null,
  root_id: null,
  parent_id: null,
  privacy: 'public',
  broadcast: 'everyone',
  clearance_status: 'approved',
  clearance_reason: null,
  clearance_updated_at: null,
  is_anonymous: false,
  ai_summary_markdown: '',
  html: null,
  url_id: null,
}

export const communityPostsBody = {
  results: [{ __entity_type: 'post', id: communityPost.id }],
  page_info: pageInfo,
  posts: { [communityPost.id]: communityPost },
  posts_metrics: {
    [communityPost.id]: {
      __entity_type: 'post_metrics',
      id: communityPost.id,
      bookmarks: { follow: 1, save: 0 },
      count: { ancestors: 0, children: 0, descendants: 0 },
      updated_at: timestamp,
    },
  },
  post_link_embeds: {},
  bookmarks: {},
  communities: {
    [community.id]: {
      id: community.id,
      name: community.name,
      slug: community.slug,
    },
  },
  pinned_post_ids: [],
}

export const communityListItemsPostsBody = {
  ...communityPostListItemPage,
  posts: { [communityPost.id]: communityPost },
  posts_metrics: communityPostsBody.posts_metrics,
}

export const communityAiAgent = {
  slug: 'self-promotion',
  agent_id: 'agent-1',
  system_user_id: 'system-user-1',
  system_username: 'community_agent',
  label_topic_slugs: [],
  on_flag_action: 'none',
  enabled: true,
  always_on: false,
  enabled_at: timestamp,
  enabled_by_id: user.id,
  entitlement: { allowed: true, reason: null },
}
