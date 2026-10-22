import { describe, expect, it } from 'vitest'
import { defineBackgroundCpuDomain, defineBackgroundCpuJob } from './define-job.mts'
import { assertRegistryInvariants } from './registry-invariants.mts'
import {
  getBackgroundCpuJob,
  getBackgroundCpuJobNames,
  getBackgroundCpuWorkerBaseline,
  requireBackgroundCpuJob,
} from './registry.mts'

const crawl = defineBackgroundCpuDomain({ domain: 'crawl', workerConcurrency: 2 })
const content = defineBackgroundCpuDomain({ domain: 'content-analysis', workerConcurrency: 1 })
const crawlJob = defineBackgroundCpuJob(crawl, { name: 'work', priority: 10 })

describe('background CPU registry contracts', () => {
  it('rejects invalid concurrency and group capacity before a worker starts', () => {
    expect(() => defineBackgroundCpuDomain({ domain: 'crawl', workerConcurrency: 0 })).toThrow(
      'workerConcurrency must be a positive integer',
    )
    expect(() =>
      defineBackgroundCpuDomain({
        domain: 'crawl',
        workerConcurrency: 1,
        group: { kind: 'domain', concurrency: 0 },
      }),
    ).toThrow('group concurrency must be a positive integer')
    expect(() =>
      defineBackgroundCpuDomain({
        domain: 'crawl',
        workerConcurrency: 1,
        group: { kind: 'lanes', cap: 0 },
      }),
    ).toThrow('lane cap must be a positive integer')
  })

  it('rejects ambiguous job names, priorities, and retry or lock settings', () => {
    expect(() => defineBackgroundCpuJob(crawl, { name: 'other.work', priority: 10 })).toThrow(
      'must not contain a domain or dot',
    )
    expect(() => defineBackgroundCpuJob(crawl, { name: 'work', priority: 0 })).toThrow(
      'needs priority 1..2048',
    )
    for (const invalid of [{ attempts: 0 }, { lockDuration: 0 }, { timeout: 0 }]) {
      expect(() =>
        defineBackgroundCpuJob(crawl, { name: 'work', priority: 10, ...invalid }),
      ).toThrow('must be a positive integer')
    }
  })

  it('assigns a single ordering group to all jobs in a capped domain', () => {
    const capped = defineBackgroundCpuDomain({
      domain: 'bedrock-embeddings',
      workerConcurrency: 1,
      group: { kind: 'domain', concurrency: 1, rateLimit: { max: 2, duration: 1_000 } },
    })
    const job = defineBackgroundCpuJob(capped, { name: 'post', priority: 10 })
    expect(job.name).toBe('bedrock-embeddings.post')
    expect(job.options.ordering).toEqual({
      key: 'bedrock-embeddings',
      concurrency: 1,
      rateLimit: { max: 2, duration: 1_000 },
    })
  })

  it('rejects duplicate and dangling registrations', () => {
    expect(() => assertRegistryInvariants([crawlJob, crawlJob], [crawl], ['crawl'])).toThrow(
      'job names must be unique',
    )
    expect(() => assertRegistryInvariants([crawlJob], [crawl, crawl], ['crawl'])).toThrow(
      'domains must be registered once',
    )
    expect(() =>
      assertRegistryInvariants([crawlJob], [crawl], ['crawl', 'content-analysis']),
    ).toThrow('needs a domain definition')
    expect(() => assertRegistryInvariants([crawlJob], [content], ['content-analysis'])).toThrow(
      'unregistered domain',
    )
  })

  it('keeps Bedrock batch creation off the shared CPU queue', () => {
    for (const name of [
      'bedrock-embeddings.create_topics',
      'bedrock-embeddings.create_posts',
      'bedrock-embeddings.create_rss_feed_items',
      'bedrock-embeddings.create_crawl_chunks',
      'bedrock-embeddings.create_images',
    ])
      expect(getBackgroundCpuJob(name)).toBeUndefined()
  })

  it('routes registered jobs by domain and refuses unknown names', () => {
    expect(getBackgroundCpuJobNames('crawl')).toContain('crawl.crawl_url')
    expect(getBackgroundCpuJobNames('crawl')).not.toContain('bedrock-embeddings.post')
    expect(getBackgroundCpuJob('crawl.crawl_url')).toBe(requireBackgroundCpuJob('crawl.crawl_url'))
    expect(() => requireBackgroundCpuJob('crawl.unknown')).toThrow(
      'Unregistered background-cpu job',
    )
    expect(getBackgroundCpuWorkerBaseline()).toBe(45)
  })
})
