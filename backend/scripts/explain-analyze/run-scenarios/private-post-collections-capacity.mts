import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { decodeScopedTimestampUuidCursor } from '@modules/pagination'
import { getUserPostsCollection } from '@services/entity-fetch/profile-collections'
import { PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE } from '@services/posts/private-collection-pagination'
import { POST_LIST_TABLES } from '@services/users/profile-collection-tables'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  cleanPrivatePostCollectionsCapacity,
  COLLECTION_TYPES,
  seedPrivatePostCollectionsCapacity,
} from '../seed-data/private-post-collections-capacity.mts'

const PAGE_SIZE = 100
const PAGE_QUERY = 'getVisiblePostCollectionRows'
const HYDRATION_QUERY = 'getPostsByAnyBatch'
const QUERY_NAMES = [PAGE_QUERY, HYDRATION_QUERY]

export async function runPrivatePostCollectionsCapacityScenarios(): Promise<void> {
  const { viewer, userIds, postIds, expectedPosts } = await seedPrivatePostCollectionsCapacity()
  try {
    await write(`/* analyzePrivatePostCollectionsCapacity */ ANALYZE posts, post_slugs,
      relation__user__hide__post, relation__user__follow__post, relation__user__subscribe__post`)
    const { rows } = await write<{ post_slugs: number; subscriptions: number }>(
      `/* countPrivatePostCollectionsRows */
       SELECT (SELECT count(*)::int FROM post_slugs) AS post_slugs,
              (SELECT count(*)::int FROM relation__user__subscribe__post) AS subscriptions`,
    )
    const corpus = rows[0]!
    for (const type of COLLECTION_TYPES) {
      const scenario = `collection-${type}-posts-at-cap`
      const relation = POST_LIST_TABLES[type]
      const scope = `user-posts:${viewer.id}:${type}:${PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE}`
      const terminalSize = expectedPosts.length - PAGE_SIZE * 2
      // The subscribed custom plan can scan the full relation before sorting. See #6591.
      const membershipRows =
        type === 'subscribed'
          ? [corpus.subscriptions, corpus.subscriptions, terminalSize]
          : [type === 'hidden' ? 127 : 126, 101, terminalSize]
      registerScenarioContract(scenario, {
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT', queryContains: PAGE_QUERY },
          ...membershipRows.map((max, pageIndex) => ({
            kind: 'maxProcessedRows' as const,
            relation,
            max,
            captureIndex: pageIndex * 2,
          })),
          ...[PAGE_SIZE, PAGE_SIZE, terminalSize].map((max, pageIndex) => ({
            kind: 'maxProcessedRows' as const,
            relation: 'post_slugs',
            max,
            captureIndex: pageIndex * 2 + 1,
          })),
        ],
        seededRows: {
          [relation]:
            type === 'subscribed'
              ? corpus.subscriptions
              : userIds.length * (type === 'hidden' ? postIds.length : postIds.length - 1),
          post_slugs: corpus.post_slugs,
        },
        crossPartition: { posts: 'Collection members can refer to posts from any month.' },
      })
      await runAndCapture(
        scenario,
        async () => {
          let after: string | undefined
          for (const offset of [0, PAGE_SIZE, PAGE_SIZE * 2]) {
            const expected = expectedPosts.slice(offset, offset + PAGE_SIZE)
            const page = await getUserPostsCollection(viewer, viewer.id, type, {
              limit: PAGE_SIZE,
              after,
            })
            assert.deepEqual(
              page.results.map(post => post.id),
              expected.map(post => post.id),
            )
            const { start_cursor, end_cursor, has_next_page } = page.page_info
            assert.ok(start_cursor)
            assertCollectionCursor(start_cursor, scope, expected[0]!)
            if (offset < PAGE_SIZE * 2) {
              assert.equal(has_next_page, true)
              assert.ok(end_cursor)
              assertCollectionCursor(end_cursor, scope, expected.at(-1)!)
            } else {
              assert.equal(has_next_page, false)
              assert.equal(end_cursor, null)
            }
            after = page.page_info.end_cursor ?? undefined
          }
        },
        undefined,
        undefined,
        { exactCapturedNames: [...QUERY_NAMES, ...QUERY_NAMES, ...QUERY_NAMES] },
      )
    }
  } finally {
    await cleanPrivatePostCollectionsCapacity(userIds, postIds)
  }
}

function assertCollectionCursor(
  cursor: string,
  scope: string,
  expected: { id: string; timestamp: number },
): void {
  const { id, timestamp } = decodeScopedTimestampUuidCursor(cursor, scope, 'Invalid fixture cursor')
  assert.deepEqual({ id, timestamp }, expected)
}
