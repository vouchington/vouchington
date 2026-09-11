import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueDetectBanEvasion,
  enqueueDetectBanEvasionAfterPostEmbedding,
  enqueueBulkDetectBanEvasionAfterPostEmbeddings,
} from './enqueues.mts'
import { ban_evasion } from './queues.mts'

describe('ban-evasion enqueues', () => {
  beforeEach(async () => {
    await ban_evasion.obliterate({ force: true })
  })

  it('uses a post-specific dedup key for post-embedding detection', async () => {
    const communityId = randomUUID()
    const userId = randomUUID()
    const postId = randomUUID()
    const inputSha256Hex = 'a'.repeat(64)

    await enqueueDetectBanEvasion(communityId, userId, postId)
    await enqueueDetectBanEvasionAfterPostEmbedding(communityId, userId, postId, inputSha256Hex)

    const waiting = await ban_evasion.getJobs('waiting')
    const jobs = waiting.filter(
      job =>
        (job.data as { communityId?: string; userId?: string }).communityId === communityId &&
        (job.data as { communityId?: string; userId?: string }).userId === userId,
    )
    expect(jobs).toHaveLength(2)
    expect(new Set(jobs.map(getDeduplicationId))).toEqual(
      new Set([
        `ban_evasion_${communityId}_${userId}`,
        `ban_evasion_post_embedding_${communityId}_${userId}_${postId}_${inputSha256Hex}`,
      ]),
    )
    expect(jobs.find(job => getDeduplicationId(job)?.includes('post_embedding'))?.data).toEqual({
      communityId,
      userId,
      postId,
    })
  })

  it('bulk-enqueues post-embedding detection jobs', async () => {
    const communityId = randomUUID()
    const userId = randomUUID()
    const postId = randomUUID()
    const inputSha256Hex = 'b'.repeat(64)

    await enqueueBulkDetectBanEvasionAfterPostEmbeddings([
      { communityId, userId, postId, inputSha256Hex },
    ])

    const waiting = await ban_evasion.getJobs('waiting')
    const job = waiting.find(
      item =>
        (item.data as { communityId?: string; userId?: string }).communityId === communityId &&
        (item.data as { communityId?: string; userId?: string }).userId === userId,
    )
    expect(job).toBeDefined()
    expect(job!.name).toBe('detect')
    expect(job!.data).toEqual({ communityId, userId, postId })
    expect(job!.opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `ban_evasion_post_embedding_${communityId}_${userId}_${postId}_${inputSha256Hex}`,
        mode: 'debounce',
      },
    })
  })
})

function getDeduplicationId(job: { opts: unknown }): string | undefined {
  return (job.opts as { deduplication?: { id?: string } }).deduplication?.id
}
