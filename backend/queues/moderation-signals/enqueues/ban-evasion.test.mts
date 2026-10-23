import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MODERATION_SIGNALS_BAN_EVASION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'
import {
  enqueueDetectBanEvasion,
  enqueueDetectBanEvasionOnJoin,
  enqueueBulkDetectBanEvasionAfterPostEmbeddings,
} from './ban-evasion.mts'
import { moderationSignalsQueue } from '../queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'

describe('ban-evasion enqueues', () => {
  it('keeps join, first-post, and bulk post-embedding triggers distinct', async () => {
    const communityId = randomUUID()
    const userId = randomUUID()
    const postId = randomUUID()
    const inputSha256Hex = 'b'.repeat(64)

    await enqueueDetectBanEvasionOnJoin(communityId, userId)
    await enqueueDetectBanEvasion(communityId, userId, postId)
    await enqueueBulkDetectBanEvasionAfterPostEmbeddings([
      { communityId, userId, postId, inputSha256Hex },
    ])

    const waiting = await readAllQueueJobs(moderationSignalsQueue)
    const jobs = waiting.filter(
      item =>
        (item.data as { communityId?: string; userId?: string }).communityId === communityId &&
        (item.data as { communityId?: string; userId?: string }).userId === userId,
    )
    expect(jobs).toHaveLength(3)
    expect(new Set(jobs.map(getDeduplicationId))).toEqual(
      new Set([
        `ban_evasion_join_${communityId}_${userId}`,
        `ban_evasion_${communityId}_${userId}`,
        `ban_evasion_post_embedding_${communityId}_${userId}_${postId}_${inputSha256Hex}`,
      ]),
    )
    const job = jobs.find(item => getDeduplicationId(item)?.includes('post_embedding'))
    expect(job).toBeDefined()
    expect(job!.name).toBe(MODERATION_SIGNALS_BAN_EVASION_JOB.name)
    expect(job!.data).toEqual({ communityId, userId, postId })
    expect(job!.opts).toMatchObject({
      priority: 10,
      attempts: 3,
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
