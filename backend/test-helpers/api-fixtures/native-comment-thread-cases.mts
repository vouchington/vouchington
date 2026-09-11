import { pageInfo, timestamp } from './data.mts'
import {
  anonymousComment,
  deletedComment,
  nestedComment,
  rootPost,
  topLevelComment,
} from './native-comment-thread-posts.mts'
import {
  anonymousCommentElection,
  bookmarkedPosts,
  markdownToHtml,
  nestedCommentElection,
  nestedCommentVote,
  rootPostElection,
  rootPostVote,
  topLevelCommentElection,
  topLevelCommentVote,
} from './native-comment-thread-sidecars.mts'
import type { ApiFixtureCase } from './types.mts'

export const nativeCommentThreadApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.comments.post-detail.default',
    method: 'GET',
    path: `/api/v1/posts/${rootPost.slug}`,
    route: {
      routeTemplate: '/api/v1/posts/:postIdOrSlug',
      pathParams: { postIdOrSlug: rootPost.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      post: {
        ...rootPost,
        can_edit_content: true,
        can_delete: true,
        can_lock: true,
      },
      html: '<p>Root post markdown</p>',
      author_aside: {
        about_html: '',
        profile_links: [],
        is_following: false,
      },
      post_metrics: {
        __entity_type: 'post_metrics',
        id: rootPost.id,
        count: { descendants: 3, children: 2, ancestors: 0 },
        bookmarks: { follow: 0, save: 1 },
        updated_at: timestamp,
      },
      post_election: rootPostElection,
      election_vote: rootPostVote,
      bookmarks: {
        [rootPost.id]: { save: true },
      },
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['https://github.com/jonathanong/filaments/issues/6573'],
  },
  {
    id: 'native.comments.descendants.default',
    method: 'GET',
    path: `/api/v1/posts/${rootPost.id}/descendants`,
    query: { limit: '2', after: 'fixture-root-and-subtree-scoped-cursor' },
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/descendants',
      pathParams: { idOrSlug: rootPost.id },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        { __entity_type: 'post', id: topLevelComment.id },
        { __entity_type: 'post', id: nestedComment.id },
        { __entity_type: 'post', id: anonymousComment.id },
        { __entity_type: 'post', id: deletedComment.id },
      ],
      page_info: pageInfo,
      posts: {
        [topLevelComment.id]: topLevelComment,
        [nestedComment.id]: nestedComment,
        [anonymousComment.id]: anonymousComment,
        [deletedComment.id]: deletedComment,
      },
      posts_metrics: {
        [topLevelComment.id]: {
          __entity_type: 'post_metrics',
          id: topLevelComment.id,
          count: { descendants: 1, children: 1, ancestors: 1 },
          bookmarks: { follow: 0, save: 1 },
          updated_at: timestamp,
        },
        [nestedComment.id]: {
          __entity_type: 'post_metrics',
          id: nestedComment.id,
          count: { descendants: 0, children: 0, ancestors: 2 },
          bookmarks: { follow: 0, save: 1 },
          updated_at: timestamp,
        },
        [anonymousComment.id]: {
          __entity_type: 'post_metrics',
          id: anonymousComment.id,
          count: { descendants: 0, children: 0, ancestors: 1 },
          bookmarks: { follow: 0, save: 0 },
          updated_at: timestamp,
        },
        [deletedComment.id]: {
          __entity_type: 'post_metrics',
          id: deletedComment.id,
          count: { descendants: 0, children: 0, ancestors: 3 },
          bookmarks: { follow: 0, save: 0 },
          updated_at: timestamp,
        },
      },
      post_elections: {
        [topLevelComment.id]: topLevelCommentElection,
        [nestedComment.id]: nestedCommentElection,
        [anonymousComment.id]: anonymousCommentElection,
      },
      election_votes: {
        [topLevelComment.id]: topLevelCommentVote,
        [nestedComment.id]: nestedCommentVote,
      },
      markdown_to_html: markdownToHtml,
      bookmarks: bookmarkedPosts,
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['https://github.com/jonathanong/filaments/issues/6573'],
  },
  {
    id: 'native.comments.ancestors.permalink',
    method: 'GET',
    path: `/api/v1/posts/${nestedComment.id}/ancestors`,
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/ancestors',
      pathParams: { idOrSlug: nestedComment.id },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        { __entity_type: 'post', id: rootPost.id },
        { __entity_type: 'post', id: topLevelComment.id },
        { __entity_type: 'post', id: nestedComment.id },
      ],
      page_info: pageInfo,
      posts: {
        [rootPost.id]: rootPost,
        [topLevelComment.id]: topLevelComment,
        [nestedComment.id]: nestedComment,
      },
      posts_metrics: {
        [rootPost.id]: {
          __entity_type: 'post_metrics',
          id: rootPost.id,
          count: { descendants: 3, children: 2, ancestors: 0 },
          bookmarks: { follow: 0, save: 1 },
          updated_at: timestamp,
        },
        [topLevelComment.id]: {
          __entity_type: 'post_metrics',
          id: topLevelComment.id,
          count: { descendants: 1, children: 1, ancestors: 1 },
          bookmarks: { follow: 0, save: 1 },
          updated_at: timestamp,
        },
        [nestedComment.id]: {
          __entity_type: 'post_metrics',
          id: nestedComment.id,
          count: { descendants: 0, children: 0, ancestors: 2 },
          bookmarks: { follow: 0, save: 1 },
          updated_at: timestamp,
        },
      },
      post_elections: {
        [rootPost.id]: rootPostElection,
        [topLevelComment.id]: topLevelCommentElection,
        [nestedComment.id]: nestedCommentElection,
      },
      election_votes: {
        [nestedComment.id]: nestedCommentVote,
      },
      markdown_to_html: {
        [rootPost.id]: '<p>Root post markdown</p>',
        [topLevelComment.id]: '<p>Top-level native comment</p>',
        [nestedComment.id]: '<p>Nested reply with votes</p>',
      },
      bookmarks: {
        [topLevelComment.id]: { save: true },
        [nestedComment.id]: { save: true },
      },
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['https://github.com/jonathanong/filaments/issues/6573'],
  },
]
