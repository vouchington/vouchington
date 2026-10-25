import { describe, expect, it } from 'vitest'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import { applySharedQueueOrdering, assertSharedJobOrdering } from './shared-queue-ordering.mts'

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

  it('requires a registered domain-prefixed lane in the job registry', () => {
    const job = (ordering?: { key: string }) => ({
      name: 'crawl.boilerplate_removal',
      domain: 'crawl',
      options: { ordering },
    })
    const configured = (key: string) => key === 'crawl:boilerplate'
    expect(() =>
      assertSharedJobOrdering(job({ key: 'crawl:boilerplate' }), configured),
    ).not.toThrow()
    expect(() => assertSharedJobOrdering(job(), configured)).toThrow('domain-prefixed')
    expect(() => assertSharedJobOrdering(job({ key: 'other:boilerplate' }), configured)).toThrow(
      'domain-prefixed',
    )
    expect(() => assertSharedJobOrdering(job({ key: 'crawl:unregistered' }), configured)).toThrow(
      'configured ordering cap',
    )
  })
})
