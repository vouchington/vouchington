import { channel } from 'node:diagnostics_channel'
import { parseEmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/payload/job-payload'
import type { EmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/types'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import {
  getEmbeddingCreationLeaseRetryDelayMs,
  getEmbeddingCreationLeaseRenewalIntervalMs,
} from '@services/bedrock-embeddings/batch/config'
import { BatchCreationDeferredError } from '@services/bedrock-embeddings-batch/orchestrator/create'
import { embeddingCreationLeaseValkeyClient } from '@data-stores/valkey/clients'
import { acquireRenewableLease } from 'valkyries/lease'
import onError from '@modules/on-error'
import {
  processBatchCreation,
  processImageBatchCreation,
  type BatchCreationDependencies,
} from '@services/bedrock-embeddings-batch/utils'
import { streamPendingTopics } from '@services/bedrock-embeddings-batch/entities/topics'
import { streamPendingPosts } from '@services/bedrock-embeddings-batch/entities/posts'
import { streamPendingRssFeedItems } from '@services/bedrock-embeddings-batch/entities/rss-feed-items'
import { streamPendingCrawlChunks } from '@services/bedrock-embeddings-batch/entities/crawl-chunks'
import {
  streamPendingImages,
  addImageToBatch,
} from '@services/bedrock-embeddings-batch/entities/images'

import {
  delayEmbeddingCreationJob,
  type EmbeddingCreationJob,
} from '@queues/bedrock-embeddings-batch/payload/creation-deferral'

const textStreams = {
  topics: streamPendingTopics,
  posts: streamPendingPosts,
  rss_feed_items: streamPendingRssFeedItems,
  crawl_chunks: streamPendingCrawlChunks,
}

const CREATION_LEASE_KEY = 'bedrock-embeddings:creation:lease'
const leaseLossChannel = channel('voucha.embedding-creation.lease-loss')
// GlideMQ creation jobs hold their processing lock for 300 seconds. The lease must not
// expire earlier, and renewal remains active for the complete handler invocation.
const MIN_CREATION_LEASE_TTL_MS = 300_000

function contentionDelayMs(): number {
  const base = getEmbeddingCreationLeaseRetryDelayMs()
  return Math.min(3_000, Math.floor(base * (1 + Math.random() * 0.5)))
}

export async function processEmbeddingCreationJob(
  job: EmbeddingCreationJob,
  jobType: BatchJobType,
  dependencies?: BatchCreationDependencies,
) {
  const cursor = parseEmbeddingScanCursor(job.data)
  const ttlMs = Math.max(MIN_CREATION_LEASE_TTL_MS, job.opts.lockDuration ?? 0)
  const lease = await acquireRenewableLease(CREATION_LEASE_KEY, {
    ttlMs,
    renewalIntervalMs: getEmbeddingCreationLeaseRenewalIntervalMs(),
    client: embeddingCreationLeaseValkeyClient,
  })
  if (!lease) return job.moveToDelayed(Date.now() + contentionDelayMs())
  void lease.lost.then(loss => {
    // Diagnostic subscribers can distinguish expiry, a successor, and transport errors without
    // exposing the private owner token. This never races or cancels external provider work.
    try {
      leaseLossChannel.publish({ jobId: job.id, jobType, reason: loss.reason })
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
    if (loss.reason === 'renewal-error')
      onError(new Error('Embedding creation lease renewal failed', { cause: loss.error }))
  })
  const reEnqueue = async (next?: EmbeddingScanCursor, delayMs?: number) => {
    await lease.release()
    return delayEmbeddingCreationJob(job, next, delayMs)
  }
  const work = await (async () => {
    try {
      if (jobType === 'images')
        return await processImageBatchCreation(
          {
            cursor,
            reEnqueue,
            isLeaseHeld: () => lease.isHeld,
            streamPending: options => streamPendingImages({ ...options, cursor }),
            addImageToBatch,
          },
          dependencies,
        )
      return await processBatchCreation(
        {
          cursor,
          reEnqueue,
          isLeaseHeld: () => lease.isHeld,
          jobType,
          streamPending: options => textStreams[jobType]({ ...options, cursor }),
        },
        dependencies,
      )
    } catch (err) {
      if (!(err instanceof BatchCreationDeferredError)) throw err
      await lease.release()
      return job.moveToDelayed(Date.now() + (err.delayMs || contentionDelayMs()))
    }
  })().then(
    value => ({ status: 'fulfilled' as const, value }),
    err => ({ status: 'rejected' as const, reason: err as unknown }),
  )
  const released = await lease.release().then(
    () => ({ status: 'fulfilled' as const }),
    err => ({ status: 'rejected' as const, reason: err as unknown }),
  )
  if (work.status === 'rejected') {
    if (released.status === 'rejected')
      onError(
        released.reason instanceof Error ? released.reason : new Error(String(released.reason)),
      )
    throw work.reason
  }
  if (released.status === 'rejected') throw released.reason
  return work.value
}
