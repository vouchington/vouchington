import { describe, expect, it } from 'vitest'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import { applySharedQueueOrdering } from './shared-queue-ordering.mts'
import { getBackgroundOrderingLimits } from '../../queues/background/ordering-caps.mts'
import { getBackgroundCpuOrderingLimits } from '../../queues/background-cpu/ordering-caps.mts'

describe('shared queue ordering admission', () => {
  it('reads the bounded cap again for each admission and preserves rate windows', () => {
    const fields = new Map<string, string | number | boolean>([['crawl_boilerplate', 4]])
    const getConcurrency = () =>
      getBoundedPositiveIntegerField({ fields }, 'crawl_boilerplate', {
        defaultValue: 4,
        maxValue: 16,
      })
    const opts = {
      ordering: {
        key: 'crawl:boilerplate',
        concurrency: 99,
        rateLimit: { max: 1, duration: 1000 },
      },
    }

    expect(
      applySharedQueueOrdering('crawl.boilerplate_removal', opts, getConcurrency).ordering,
    ).toEqual({
      key: 'crawl:boilerplate',
      concurrency: 4,
      rateLimit: { max: 1, duration: 1000 },
    })
    fields.set('crawl_boilerplate', 2)
    expect(
      applySharedQueueOrdering('crawl.boilerplate_removal', opts, getConcurrency).ordering
        ?.concurrency,
    ).toBe(2)
    fields.set('crawl_boilerplate', 17)
    expect(
      applySharedQueueOrdering('crawl.boilerplate_removal', opts, getConcurrency).ordering
        ?.concurrency,
    ).toBe(4)
    expect(opts.ordering.concurrency).toBe(99)
  })

  it('rejects jobs without an ordering key', () => {
    expect(() => applySharedQueueOrdering('crawl.boilerplate_removal', {}, () => 4)).toThrow(
      'ordering key',
    )
    expect(() =>
      applySharedQueueOrdering(
        'ses-inbound.process',
        { ordering: { key: 'openai-moderation' } },
        () => 5,
      ),
    ).toThrow('domain-prefixed')
  })

  it('keeps a required singleton lane at one when its configured value exceeds its bound', () => {
    const fields = new Map<string, string | number | boolean>([['bluesky_follow_propagation', 2]])
    const limits = getBackgroundOrderingLimits('bluesky-follow-propagation')
    const getConcurrency = () =>
      getBoundedPositiveIntegerField({ fields }, 'bluesky_follow_propagation', {
        defaultValue: limits.defaultValue,
        maxValue: limits.maxValue,
      })
    expect(
      applySharedQueueOrdering(
        'bluesky-follow-propagation.reconcile',
        { ordering: { key: 'bluesky-follow-propagation' } },
        getConcurrency,
      ).ordering?.concurrency,
    ).toBe(1)
    expect(getBackgroundCpuOrderingLimits('ai-spend-cap').maxValue).toBe(1)
    expect(getBackgroundCpuOrderingLimits('bedrock-embeddings:creation')).toMatchObject({
      defaultValue: 1,
      maxValue: 1,
    })
    expect(getBackgroundCpuOrderingLimits('crawl:boilerplate').defaultValue).toBe(4)
    expect(
      getBackgroundCpuOrderingLimits('crawl:018f7757-2e3e-7cc0-930c-25b612ca562a'),
    ).toMatchObject({ configKey: 'crawl:hostname', defaultValue: 1, maxValue: 1 })
  })
})
