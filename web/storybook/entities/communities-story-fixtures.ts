import { communities, posts, postsResponse, storyCurrentUser, topics } from './entity-fixtures'
import type {
  CommunitiesSearchResponseBody,
  Community,
  CommunityListItem,
  CommunityMember,
  CommunityMembersResponseBody,
  CommunityMetrics,
  CommunityPostsResponseBody,
} from '@/types/api-responses'
import type { CommunityListPageData } from '@/types/api-responses/community-list-pages'

export const communityEntities = communities.map((community, index) => ({
  __entity_type: 'community',
  created_by_id: storyCurrentUser.id,
  updated_by_id: storyCurrentUser.id,
  markdown: community.description_markdown,
  banner_image_id: null,
  profile_image_id: null,
  list_type: index === 1 ? 'mute' : 'follow',
  member_invites_allowed_at: true,
  ...community,
})) as unknown as Community[]

export const communityMetrics: Record<string, CommunityMetrics> = Object.fromEntries(
  communityEntities.map((community, index) => [
    community.id,
    {
      member_count: 1200 - index * 400,
      post_count: 84 - index * 20,
      list_item_count: index === 0 ? 12 : 0,
    },
  ]),
) as Record<string, CommunityMetrics>

export const communitiesResponse: CommunitiesSearchResponseBody = {
  results: communityEntities.map(community => ({ __entity_type: 'community', id: community.id })),
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  communities: Object.fromEntries(communityEntities.map(community => [community.id, community])),
  users: {
    [storyCurrentUser.id]: {
      account_type: null,
      id: storyCurrentUser.id,
      username: storyCurrentUser.username ?? null,
    },
  },
  community_metrics: communityMetrics,
  community_memberships: {},
  pending_application_community_ids: [],
}

export const storyTopicListItem = {
  __entity_type: 'community_list_item',
  id: 'community-list-item-topic',
  community_id: communityEntities[0]!.id,
  item_type: 'topic',
  entity_id: topics[0]!.id,
  order_index: 0,
  added_by_id: storyCurrentUser.id,
  created_at: '2026-05-10T12:00:00.000Z',
} satisfies CommunityListItem

export const storyTopicListData = {
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  results: [{ __entity_type: 'community_list_item', id: storyTopicListItem.id }],
  community_list_items: { [storyTopicListItem.id]: storyTopicListItem },
  topics: { [topics[0]!.id]: topics[0]! },
} satisfies CommunityListPageData

export const storyCommunityPostsData = {
  results: posts.slice(1, 3).map(post => ({ __entity_type: 'post' as const, id: post.id })),
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: postsResponse.posts,
  posts_metrics: postsResponse.posts_metrics,
  communities: {
    [communityEntities[0]!.id]: {
      id: communityEntities[0]!.id,
      name: communityEntities[0]!.name,
      slug: communityEntities[0]!.slug,
    },
  },
  pinned_post_ids: [posts[0]!.id],
} satisfies CommunityPostsResponseBody

export const storyMembership: CommunityMember = {
  __entity_type: 'community_member',
  id: 'story-member-1',
  community_id: communityEntities[0]!.id,
  user_id: storyCurrentUser.id,
  role: 'member',
  approved_by_id: null,
  removed_at: null,
  removed_by_id: null,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
}

export const communityAsideOwners = {
  results: [{ __entity_type: 'community_member', id: 'community-member-owner' }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_members: {
    'community-member-owner': {
      __entity_type: 'community_member',
      id: 'community-member-owner',
      community_id: communityEntities[0]!.id,
      user_id: storyCurrentUser.id,
      role: 'owner',
      approved_by_id: null,
      removed_at: null,
      removed_by_id: null,
      created_at: '2026-05-10T12:00:00.000Z',
      updated_at: '2026-05-10T12:00:00.000Z',
    },
  },
  users: {
    [storyCurrentUser.id]: {
      account_type: null,
      id: storyCurrentUser.id,
      username: storyCurrentUser.username,
      profile_image_id: null,
    },
  },
} satisfies CommunityMembersResponseBody

export const communityAsideModerators = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_members: {},
  users: {},
} satisfies CommunityMembersResponseBody
