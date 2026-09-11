import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getUserBookmarkRelationsForEntityType } from './bloom-filter.mts'
import {
  checkBookmarkBloomCandidatesByRelations,
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
