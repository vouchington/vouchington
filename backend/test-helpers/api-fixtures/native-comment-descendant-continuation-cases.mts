import { encodeScopedUuidCursor } from '@modules/pagination'
import { completePostMetrics } from './native-post-data.mts'
import { topLevelComment, nestedComment, anonymousComment } from './native-comment-thread-posts.mts'
import type { ApiFixtureCase } from './types.mts'

const rootId = '70000000-0000-7000-8000-000000005430'
const headAId = '70000000-0000-7000-8000-000000005431'
const filteredHeadId = '70000000-0000-7000-8000-000000005433'
const headCId = '70000000-0000-7000-8000-000000005436'
const childId = '70000000-0000-7000-8000-000000005434'
const omittedReplyId = '70000000-0000-7000-8000-000000005437'
const rootScope = `comment-descendants-v2:${rootId}:${rootId}`
const cursorAfterFirstPage = encodeScopedUuidCursor(filteredHeadId, rootScope)
const cursorAfterFiltered = encodeScopedUuidCursor(
  '70000000-0000-7000-8000-000000005435',
  rootScope,
)
const posts = {
  [headAId]: { ...topLevelComment, id: headAId, parent_post_id: rootId, root_post_id: rootId },
  [headCId]: { ...anonymousComment, id: headCId, parent_post_id: rootId, root_post_id: rootId },
  [childId]: { ...nestedComment, id: childId, parent_post_id: headAId, root_post_id: rootId },
  [omittedReplyId]: {
    ...nestedComment,
    id: omittedReplyId,
    parent_post_id: childId,
    root_post_id: rootId,
  },
}
const postById = posts as Record<string, (typeof posts)[keyof typeof posts]>
function pageBody(ids: string[], firstInspected: string | null, nextCursor: string | null) {
  return {
    results: ids.map(id => ({ __entity_type: 'post', id, ranking: 0, search_vector_ts: null })),
    page_info: {
      has_next_page: nextCursor !== null,
      start_cursor: firstInspected ? encodeScopedUuidCursor(firstInspected, rootScope) : null,
      end_cursor: nextCursor,
    },
    posts: Object.fromEntries(ids.map(id => [id, postById[id]])),
    posts_metrics: Object.fromEntries(ids.map(id => [id, completePostMetrics(id, 0)])),
    post_elections: {},
    markdown_to_html: Object.fromEntries(
      ids.flatMap(id => (postById[id]?.markdown ? [[id, `<p>${postById[id]!.markdown}</p>`]] : [])),
    ),
  }
}
const shared: Pick<ApiFixtureCase, 'method' | 'auth' | 'status' | 'consumers' | 'migratedFrom'> = {
  method: 'GET',
  auth: 'none',
  status: 200,
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom: [
    'backend/api/v1/posts/__tests__/post.descendants.part-2.test.mts',
    'backend/services/comments/descendant-page.fold.test.mts',
  ],
}
function rootCase(
  id: string,
  after: string | undefined,
  body: unknown,
  limit = '3',
): ApiFixtureCase {
  return {
    ...shared,
    id,
    path: `/api/v1/posts/${rootId}/descendants`,
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/descendants',
      pathParams: { idOrSlug: rootId },
    },
    query: after ? { limit, after } : { limit },
    body,
  }
}
export const nativeCommentDescendantContinuationApiFixtureCases: ApiFixtureCase[] = [
  rootCase(
    'native.comments.descendants.short-continuation',
    undefined,
    pageBody([headAId, childId], headAId, cursorAfterFirstPage),
  ),
  rootCase(
    'native.comments.descendants.empty-continuation',
    cursorAfterFirstPage,
    pageBody([], '70000000-0000-7000-8000-000000005435', cursorAfterFiltered),
    '1',
  ),
  rootCase(
    'native.comments.descendants.after-filtered-head',
    cursorAfterFiltered,
    pageBody([headCId], headCId, null),
  ),
  {
    ...shared,
    id: 'native.comments.descendants.expand-preview-child',
    path: `/api/v1/posts/${childId}/descendants`,
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/descendants',
      pathParams: { idOrSlug: childId },
    },
    query: { limit: '3' },
    body: {
      ...pageBody([omittedReplyId], null, null),
      page_info: {
        has_next_page: false,
        start_cursor: encodeScopedUuidCursor(
          omittedReplyId,
          `comment-descendants-v2:${rootId}:${childId}`,
        ),
        end_cursor: null,
      },
    },
  },
]
