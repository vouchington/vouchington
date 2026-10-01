import { createTestUser } from '@voucha/test-helpers'
import { bloomValkeyClient } from '@data-stores/valkey'
import { getBookmarkBloomFilter } from './bloom-filter-utils.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  getUserBookmarkRelationsForEntityType,
  backfillUserBookmarkBloomFilter,
  deleteUserBookmarkBloomFilter,
} from './bloom-filter.mts'
import {
  checkBookmarkBloomCandidatesByRelations,
  checkBookmarkBloomCandidates,
  invokeBookmarkBloomCandidateChunks,
  type BookmarkBloomCandidateChunk,
} from './bloom-filter-candidates.mts'

describe('bookmark bloom filter candidate chunks', () => {
  it('invokes chunks sequentially while preserving result order', async () => {
    const chunks: BookmarkBloomCandidateChunk[] = [
      { itemCount: 1, lookupItems: ['follow:a'] },
      { itemCount: 1, lookupItems: ['follow:b'] },
      { itemCount: 1, lookupItems: ['follow:c'] },
    ]
    const started: string[] = []
    const finished: string[] = []
    let inFlight = 0
    let maxInFlight = 0

    const results = await invokeBookmarkBloomCandidateChunks(chunks, async chunk => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      started.push(chunk.lookupItems[0]!)
      await Promise.resolve()
      finished.push(chunk.lookupItems[0]!)
      inFlight -= 1
      return `result:${chunk.lookupItems[0]}`
    })

    expect(maxInFlight).toBe(1)
    expect(started).toEqual(['follow:a', 'follow:b', 'follow:c'])
    expect(finished).toEqual(['follow:a', 'follow:b', 'follow:c'])
    expect(results).toEqual(['result:follow:a', 'result:follow:b', 'result:follow:c'])
  })

  it('returns unready relation results through the production chunk path', async () => {
    const topicFollowRelation = getUserBookmarkRelationsForEntityType('topic').find(
      relation => relation.predicate === 'follow',
    )
    if (!topicFollowRelation) throw new Error('Missing user->follow->topic relation metadata')

    const result = await checkBookmarkBloomCandidatesByRelations(
      randomUUID(),
      [topicFollowRelation.table_name],
      ['missing-topic-id'],
    )

    expect(result[topicFollowRelation.table_name]).toEqual({ ready: false, results: [null] })
  })
})

describe('bookmark candidate errors in an owned filter', () => {
  it('reports a real WRONGTYPE error and falls back without affecting another user', async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    const relation = getUserBookmarkRelationsForEntityType('topic').find(
      r => r.predicate === 'follow',
    )!
    const objectId = crypto.randomUUID()
    try {
      await backfillUserBookmarkBloomFilter(user.id)
      await backfillUserBookmarkBloomFilter(other.id)
      const initial = await checkBookmarkBloomCandidates(user.id, relation.table_name, [objectId])
      expect(initial).toEqual({ ready: true, results: [expect.any(Boolean)] })
      const otherInitial = await checkBookmarkBloomCandidates(other.id, relation.table_name, [
        objectId,
      ])
      expect(otherInitial).toEqual({ ready: true, results: [expect.any(Boolean)] })
      const before = sentryCaptureExceptionMock.mock.calls.length
      await bloomValkeyClient.set(getBookmarkBloomFilter(user.id).getKey(), 'owned-wrong-type')

      await expect(
        checkBookmarkBloomCandidates(user.id, relation.table_name, [objectId]),
      ).resolves.toEqual({ ready: false, results: [null] })
      const reported = sentryCaptureExceptionMock.mock.calls.slice(before).map(([err]) => err)
      expect(reported.some(err => err instanceof Error && /WRONGTYPE/i.test(err.message))).toBe(
        true,
      )
      await expect(
        checkBookmarkBloomCandidates(other.id, relation.table_name, [objectId]),
      ).resolves.toEqual(otherInitial)
    } finally {
      await Promise.all([
        deleteUserBookmarkBloomFilter(user.id),
        deleteUserBookmarkBloomFilter(other.id),
      ])
    }
  })
})
