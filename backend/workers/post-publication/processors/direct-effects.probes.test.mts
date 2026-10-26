import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers/postgres-query-pool-observer'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { executeTestPublicationChain } from '@voucha/test-helpers/publication-effect-chain'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../../data-stores/valkey-core/glide-mq-client.mts'
import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { postPublicationEffectJobId } from '@queues/post-publication/enqueues'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import { caches } from '@services/entity-cache/caches'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { processApplyPostPublicationEffects } from './direct-effects.mts'

describe('publication transient storage recovery', () => {
  it('retries the same preimage after a real PostgreSQL read rejects and completes its effects', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      title: 'Transient publication',
      slug: `retry-${randomUUID()}`,
      markdown: '',
    })
    const keys = [{ kind: 'impact_post' as const, uuidValue: postId }]
    const data: PostPublicationEffectsJobData = {
      changeId: randomUUID(),
      postId,
      scope: { type: 'post', id: postId },
      reason: 'post_updated',
      keys,
      keyHash: hashCapturedPublicationKeys(keys),
      chunkIndex: 0,
      scopeStart: true,
      scopeTopicKeysCaptured: false,
      keyOffset: 0,
    }
    const rootId = postPublicationEffectJobId(data)
    const rootPayloads: unknown[] = []
    let rejectNextRead = true
    await caches.post_metrics.set(postId, 'preimage awaiting effects')
    const worker = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'publication_storage_retry',
      connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
      workerOptions: { blockTimeout: 100 },
      processor: async job => {
        if (job.id === rootId) rootPayloads.push(structuredClone(job.data))
        return (
          await observeTestPostgresQueryPools(
            '/* listLivePublicationPosts */',
            () => processApplyPostPublicationEffects(job.data as PostPublicationEffectsJobData),
            () => {
              if (rejectNextRead) {
                rejectNextRead = false
                throw new Error('Injected transient read failure')
              }
            },
          )
        ).result
      },
    })
    await executeTestPublicationChain(data, async next => {
      // Exercise retry/idempotency without waiting for the production outage backoff window.
      const job = await worker.add(POST_PUBLICATION_EFFECTS_JOB, next, {
        jobId: postPublicationEffectJobId(next),
        backoff: { type: 'fixed', delay: 1 },
      })
      expect(await worker.settled(job)).toBe('completed')
    })
    expect(rootPayloads).toEqual([data, data])
    expect(await worker.queue.getJob(rootId)).toBeNull()
    expect(await caches.post_metrics.get(postId)).not.toBe('preimage awaiting effects')
  })
})
