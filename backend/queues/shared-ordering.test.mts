import { describe, expect, it } from 'vitest'
import { assertSharedJobOrdering } from './shared-ordering.mts'

const configured = (key: string) => key === 'crawl:boilerplate'
const job = (ordering?: { key: string }) => ({
  name: 'crawl.boilerplate_removal',
  domain: 'crawl',
  options: { ordering },
})

describe('shared queue registry ordering', () => {
  it('requires a configured domain-prefixed lane', () => {
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
