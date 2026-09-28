import { community, communityPostsBody, pageInfo, user } from './web-community-data.mts'
import { communityMember } from './web-community-member-data.mts'
import {
  storyMemberPages,
  storyPostIds,
  webStoryClusterRssFeedItems,
} from './story-cluster-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityFeedApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.members.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/members`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/members',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [{ __entity_type: 'community_member', id: communityMember.id }],
      page_info: pageInfo,
      community_members: { [communityMember.id]: communityMember },
      users: { [user.id]: user },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/members.mts'],
  },
  {
    id: 'web.communities.posts.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/posts`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/posts',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: communityPostsBody,
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/posts.mts'],
  },
  {
    id: 'web.communities.news.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/news`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/news',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [],
      page_info: pageInfo,
      posts: {},
      posts_metrics: {},
      users: {},
      stories: {},
      story_member_pages: storyMemberPages,
      story_post_ids: storyPostIds,
      rss_feed_items: webStoryClusterRssFeedItems,
      rss_feed_item_elections: {},
      rss_feed_item_thumbnail_url: {},
      rss_feed_item_embeds: {},
      related_posts_by_url_id: {},
      election_votes: {},
      bookmarks: {},
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/news.mts'],
  },
]
