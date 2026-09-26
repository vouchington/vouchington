import { describe, expect, it } from 'vitest'
import { refreshPostCategoryVoteStats } from './category-vote-stats.mts'
import { PRIMARY_REFRESH_BATCH_SIZE } from '@services/elections-votes/entity-relation/vote-stats-batch'
import type { EntityRelationElectionTarget } from '@queues/elections/types'

describe('category vote stats committed-chunk effects', () => {
  it('publishes one notification for each successful changed chunk, including aliases', async () => {
    const postId = crypto.randomUUID()
    const relations = Array.from({ length: PRIMARY_REFRESH_BATCH_SIZE + 1 }, () => ({
      id: crypto.randomUUID(),
    }))
    const refreshed: EntityRelationElectionTarget[][] = []
    const notified: string[] = []
    await refreshPostCategoryVoteStats(postId, 'relation__post__category__topic_alias', relations, {
      refresh: async targets => {
        refreshed.push([...targets])
        return targets
      },
      enqueueNotifications: id => {
        notified.push(id)
      },
    })
    expect(refreshed.map(chunk => chunk.length)).toEqual([PRIMARY_REFRESH_BATCH_SIZE, 1])
    expect(refreshed.flat().map(target => target.entityRelationId)).toEqual(
      relations.map(relation => relation.id),
    )
    expect(notified).toEqual([postId, postId])
  })
  it('publishes no notification for no-op success or queued fallback', async () => {
    const postId = crypto.randomUUID()
    const notified: string[] = []
    for (const result of [[], undefined] as const) {
      await refreshPostCategoryVoteStats(
        postId,
        'relation__post__category__topic',
        [{ id: crypto.randomUUID() }],
        {
          refresh: async () => result,
          enqueueNotifications: id => {
            notified.push(id)
          },
        },
      )
    }
    expect(notified).toEqual([])
  })
  it('keeps earlier committed effects when a later chunk falls back', async () => {
    const postId = crypto.randomUUID()
    const relations = Array.from({ length: PRIMARY_REFRESH_BATCH_SIZE + 1 }, () => ({
      id: crypto.randomUUID(),
    }))
    let chunks = 0
    const notified: string[] = []
    await refreshPostCategoryVoteStats(postId, 'relation__post__category__topic', relations, {
      refresh: async targets => (++chunks === 1 ? targets : undefined),
      enqueueNotifications: id => {
        notified.push(id)
      },
    })
    expect(chunks).toBe(2)
    expect(notified).toEqual([postId])
  })
})
