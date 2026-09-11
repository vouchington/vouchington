import { describe, expect, it } from 'vitest'

import { defineQueryContract, queryString } from '@modules/pagination'
import { apiQuery } from './response-contract.mts'

describe('API query marker', () => {
  it('is a runtime no-op for a structurally valid query contract', () => {
    const contract = defineQueryContract({ q: queryString({ description: 'Search text' }) })
    expect(apiQuery('GET:/api/v1/items', contract)).toBeUndefined()
  })

  it('rejects malformed carrier contracts at compile time', () => {
    const malformed = { queryContract: { limit: { kind: 'integer' } } } as const

    // @ts-expect-error -- apiQuery rejects integer descriptors without required bounds
    expect(apiQuery('GET:/api/v1/items', malformed)).toBeUndefined()
  })
})
