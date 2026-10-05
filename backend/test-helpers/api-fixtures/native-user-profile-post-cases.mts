import { pageInfo } from './data.mts'
import {
  completeNativePost,
  completePostElection,
  completePostElectionVote,
  completePostMetrics,
} from './native-post-data.mts'
import type { ApiFixtureCase } from './types.mts'

const profileReviewPost = completeNativePost({
  id: 'profile-review-1',
  slug: 'profile-review',
  post_type: 'review',
  title: 'Profile review',
  markdown: 'Authored profile review',
})
const profileDiscussionPost = completeNativePost({
  id: 'profile-discussion-1',
  slug: 'profile-discussion',
  title: 'Profile discussion',
  markdown: 'Authored profile discussion',
})
const profileCommentRootPost = completeNativePost({
  ...profileReviewPost,
  id: 'profile-comment-root-1',
  slug: 'profile-comment-root',
  title: 'Root review for profile comment',
})
const profileCommentPost = completeNativePost({
  id: 'profile-comment-1',
  slug: null,
  post_type: 'comment',
  title: 'Profile comment',
  markdown: 'Authored profile comment',
  parent_post_id: profileCommentRootPost.id,
  root_post_id: profileCommentRootPost.id,
})

const profileMcpPost = completeNativePost({
  id: 'profile-mcp-1',
  slug: 'profile-mcp',
  title: 'Profile post written through MCP',
  markdown: 'Written by an agent on behalf of the author',
  provenance: { via: 'mcp', app_name: 'Fixture Agent' },
})
const profileApiPost = completeNativePost({
  id: 'profile-api-1',
  slug: 'profile-api',
  title: 'Profile post written through the API',
  markdown: 'Written by an unnamed API client',
  provenance: { via: 'api', app_name: null },
})

function profilePostFeedBody(
  results: Array<Record<string, unknown> & { id: string; post_type: string }>,
  sidecars: Array<Record<string, unknown> & { id: string; post_type: string }> = results,
) {
  return {
    results: results.map(post => ({
      __entity_type: 'post',
      id: post.id,
      post_type: post.post_type,
    })),
    page_info: pageInfo,
    posts: Object.fromEntries(sidecars.map(post => [post.id, post])),
    posts_metrics: Object.fromEntries(
      results.map((post, index) => [post.id, completePostMetrics(post.id, index)]),
    ),
    post_elections: Object.fromEntries(
      results.map((post, index) => [post.id, completePostElection(post.id, index)]),
    ),
    markdown_to_html: Object.fromEntries(
      results.map(post => [post.id, `<p>Rendered ${post.id}</p>`]),
    ),
    communities: {},
    bookmarks: {},
    election_votes: Object.fromEntries(
      results.map((post, index) => [post.id, completePostElectionVote(post.id, index)]),
    ),
  }
}

export const nativeUserProfilePostApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.users.profile.posts.all',
    method: 'GET',
    path: '/api/v1/posts',
    query: {
      creator: 'user-abc',
      limit: '25',
      sort: 'new',
      post_types: 'review,discussion,comment',
    },
    route: { routeTemplate: '/api/v1/posts' },
    auth: 'fixture-user',
    status: 200,
    body: profilePostFeedBody(
      [profileReviewPost, profileDiscussionPost, profileCommentPost],
      [profileReviewPost, profileDiscussionPost, profileCommentPost, profileCommentRootPost],
    ),
    consumers: ['swift-core', 'swift-ui'],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.posts.reviews',
    method: 'GET',
    path: '/api/v1/posts',
    query: { creator: 'user-abc', limit: '25', sort: 'new', post_types: 'review' },
    route: { routeTemplate: '/api/v1/posts' },
    auth: 'fixture-user',
    status: 200,
    body: profilePostFeedBody([profileReviewPost]),
    consumers: ['swift-core', 'swift-ui'],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.posts.discussions',
    method: 'GET',
    path: '/api/v1/posts',
    query: { creator: 'user-abc', limit: '25', sort: 'new', post_types: 'discussion' },
    route: { routeTemplate: '/api/v1/posts' },
    auth: 'fixture-user',
    status: 200,
    body: profilePostFeedBody([profileDiscussionPost]),
    consumers: ['swift-core', 'swift-ui'],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.posts.provenance',
    method: 'GET',
    path: '/api/v1/posts',
    query: { creator: 'user-abc', limit: '25', sort: 'new', post_types: 'discussion' },
    route: { routeTemplate: '/api/v1/posts' },
    auth: 'fixture-user',
    status: 200,
    body: profilePostFeedBody([profileMcpPost, profileApiPost, profileDiscussionPost]),
    consumers: [],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.posts.staff-provenance',
    method: 'GET',
    path: '/api/v1/posts',
    query: { creator: 'user-abc', limit: '25', sort: 'new', post_types: 'discussion,review' },
    route: { routeTemplate: '/api/v1/posts' },
    auth: 'fixture-admin',
    status: 200,
    body: profilePostFeedBody([
      {
        ...profileMcpPost,
        staff_provenance: {
          created_via: 'mcp',
          oauth_client: {
            client_id: 'voucha_fixture_agent',
            client_name: 'Fixture Agent',
            metadata_url: null,
            verified: true,
          },
        },
      },
      { ...profileReviewPost, staff_provenance: { created_via: 'web', oauth_client: null } },
    ]),
    consumers: [],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.posts.comments',
    method: 'GET',
    path: '/api/v1/posts',
    query: { creator: 'user-abc', limit: '25', sort: 'new', post_types: 'comment' },
    route: { routeTemplate: '/api/v1/posts' },
    auth: 'fixture-user',
    status: 200,
    body: profilePostFeedBody([profileCommentPost], [profileCommentPost, profileCommentRootPost]),
    consumers: ['swift-core', 'swift-ui'],
    migratedFrom: [],
  },
]
