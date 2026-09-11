import { completeNativePost, completePostMetrics } from './native-post-data.mts'
import { nestedComment, rootPost, topLevelComment } from './native-comment-thread-posts.mts'
import type { ApiFixtureCase } from './types.mts'

const boundedAncestorRoot = completeNativePost({
  id: 'bounded-ancestor-root',
  markdown: 'Bounded ancestor root',
  title: 'Bounded ancestor thread',
})
const boundedAncestorComments = Array.from({ length: 8 }, (_, index) =>
  completeNativePost({
    id: `bounded-ancestor-comment-${index}`,
    markdown: `Bounded ancestor comment ${index}`,
    parent_id: index === 0 ? boundedAncestorRoot.id : `bounded-ancestor-comment-${index - 1}`,
    post_type: 'comment',
    root_id: boundedAncestorRoot.id,
    slug: null,
    title: '',
  }),
)
const boundedAncestorTarget = boundedAncestorComments.at(-1)!

type NativeCommentAncestorPost =
  | ReturnType<typeof completeNativePost>
  | typeof rootPost
  | typeof topLevelComment
  | typeof nestedComment

function boundedAncestorBody(
  posts: NativeCommentAncestorPost[],
  page_info: { end_cursor: string | null; has_next_page: boolean; start_cursor: string | null },
) {
  return {
    results: posts.map(post => ({ __entity_type: 'post' as const, id: post.id })),
    page_info,
    posts: Object.fromEntries(posts.map(post => [post.id, post])),
    posts_metrics: Object.fromEntries(
      posts.map((post, index) => [post.id, completePostMetrics(post.id, index)]),
    ),
    markdown_to_html: Object.fromEntries(posts.map(post => [post.id, `<p>${post.markdown}</p>`])),
  }
}

export const nativeCommentAncestorPaginationApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.comments.ancestors.bounded.shallow',
    method: 'GET',
    path: `/api/v1/posts/${nestedComment.id}/ancestors`,
    query: { limit: '5' },
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/ancestors',
      pathParams: { idOrSlug: nestedComment.id },
    },
    auth: 'fixture-user',
    status: 200,
    body: boundedAncestorBody([rootPost, topLevelComment, nestedComment], {
      has_next_page: false,
      start_cursor: 'fixture-ancestor-shallow-start',
      end_cursor: null,
    }),
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['https://github.com/jonathanong/filaments/issues/11213'],
  },
  {
    id: 'native.comments.ancestors.bounded.deep-initial',
    method: 'GET',
    path: `/api/v1/posts/${boundedAncestorTarget.id}/ancestors`,
    query: { limit: '5' },
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/ancestors',
      pathParams: { idOrSlug: boundedAncestorTarget.id },
    },
    auth: 'fixture-user',
    status: 200,
    body: boundedAncestorBody([boundedAncestorRoot, ...boundedAncestorComments.slice(-6)], {
      has_next_page: true,
      start_cursor: 'fixture-ancestor-deep-initial-start',
      end_cursor: 'fixture-ancestor-deep-initial-end',
    }),
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['https://github.com/jonathanong/filaments/issues/11213'],
  },
  {
    id: 'native.comments.ancestors.bounded.deep-continuation',
    method: 'GET',
    path: `/api/v1/posts/${boundedAncestorTarget.id}/ancestors`,
    query: { after: 'fixture-ancestor-deep-initial-end', limit: '5' },
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/ancestors',
      pathParams: { idOrSlug: boundedAncestorTarget.id },
    },
    auth: 'fixture-user',
    status: 200,
    body: boundedAncestorBody([boundedAncestorRoot, ...boundedAncestorComments.slice(0, 2)], {
      has_next_page: false,
      start_cursor: 'fixture-ancestor-deep-continuation-start',
      end_cursor: null,
    }),
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['https://github.com/jonathanong/filaments/issues/11213'],
  },
]
