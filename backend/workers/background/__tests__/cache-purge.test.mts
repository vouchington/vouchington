import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as cachePurge from '@services/entity-cache/purge'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { CACHE_PURGE_TAGS_JOB } from '@queues/background/enqueues/cache-purge-jobs'
import { getBackgroundDomainDefinition } from '@queues/background/enqueues/registry'
import { background } from '@queues/background/queues'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

const worker = createBackgroundWorker({ handlers: BACKGROUND_HANDLERS, domains: ['cache-purge'] })

describe('cache-purge background domain', () => {
  // The real processor over a spied purge boundary: the real purge would call Cloudflare.
  const purgeCacheTags = vi.spyOn(cachePurge, 'purgeCacheTags')

  beforeEach(() => {
    purgeCacheTags.mockReset()
    purgeCacheTags.mockResolvedValue(undefined)
  })

  afterAll(async () => {
    purgeCacheTags.mockRestore()
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('limits outbound purges to 4 per minute under Workers Cache Free-tier, across every worker', () => {
    expect(getBackgroundDomainDefinition('cache-purge').rateLimit).toEqual({
      max: 4,
      duration: 60_000,
    })
    expect(CACHE_PURGE_TAGS_JOB.options.ordering).toMatchObject({
      key: 'cache-purge',
      rateLimit: { max: 4, duration: 60_000 },
    })
  })

  it('forwards a queued purge job to the cache-purge boundary', async () => {
    const tags = [`post:${crypto.randomUUID()}`]
    await background.add(CACHE_PURGE_TAGS_JOB.name, { tags }, CACHE_PURGE_TAGS_JOB.options)

    expect(purgeCacheTags).toHaveBeenCalledWith(tags)
  })

  it('rejects the retired single-tag queue payload', async () => {
    const tag = `post:${crypto.randomUUID()}`
    await expect(
      background.add(
        CACHE_PURGE_TAGS_JOB.name,
        { tag },
        {
          ...CACHE_PURGE_TAGS_JOB.options,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
          priority: 10,
        },
      ),
    ).rejects.toThrow('Cache purge job requires tags')
    expect(purgeCacheTags).not.toHaveBeenCalled()
  })
})
