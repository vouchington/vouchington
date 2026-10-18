import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { LANGUAGE_DETECTION_DEFAULTS, PRIORITY_DEFAULT } from './config.mts'
import { enqueueBulkLanguageDetection, enqueueLanguageDetection } from './enqueues.mts'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { LanguageDetectionEntityType } from './types.mts'

const ENTITY_TYPES = [
  'post',
  'rss_feed_item',
  'crawl',
  'community',
  'user',
  'topic',
] satisfies LanguageDetectionEntityType[]

describe('language-detection enqueues', () => {
  const ownedJobs: string[] = []
  afterEach(async () => {
    await Promise.all(
      ownedJobs.splice(0).map(async id => {
        const job = await backgroundCpu.getJob(id)
        await job?.remove()
      }),
    )
  })

  it('enqueues multiple jobs through one bulk call with per-ID deduplication', async () => {
    const ids = [randomUUID(), randomUUID()]

    const jobs = await enqueueBulkLanguageDetection('rss_feed_item', ids, 3)
    ownedJobs.push(...jobs.map(job => job.id))

    expect(jobs).toHaveLength(2)
    expect(jobs.map(job => job.data)).toEqual(ids.map(id => ({ id })))
    expect(jobs.map(job => job.opts.priority)).toEqual([3, 3])
    expect(jobs.map(job => job.opts.deduplication?.id)).toEqual(
      ids.map(id => `content-analysis:language:rss_feed_item:${id}`),
    )
  })

  it.each(ENTITY_TYPES)('enqueues %s jobs through the shared enqueue helper', async entityType => {
    const id = randomUUID()

    const job = await enqueueLanguageDetection(entityType, id)
    assert(job)
    ownedJobs.push(job.id)

    expect(job.name).toBe(`content-analysis.${entityType}`)
    expect(job.data).toEqual({ id })
    expect(job.opts).toMatchObject({
      attempts: LANGUAGE_DETECTION_DEFAULTS.attempts,
      backoff: LANGUAGE_DETECTION_DEFAULTS.backoff,
      priority: PRIORITY_DEFAULT,
      removeOnComplete: LANGUAGE_DETECTION_DEFAULTS.removeOnComplete,
      removeOnFail: LANGUAGE_DETECTION_DEFAULTS.removeOnFail,
      deduplication: {
        id: `content-analysis:language:${entityType}:${id}`,
        mode: 'debounce',
        ttl: LANGUAGE_DETECTION_DEFAULTS.deduplicationTtlMs,
      },
    })
  })

  it('keeps caller priority overrides', async () => {
    const id = randomUUID()

    const job = await enqueueLanguageDetection('post', id, 3)
    assert(job)
    ownedJobs.push(job.id)

    expect(job.opts.priority).toBe(3)
  })
})
