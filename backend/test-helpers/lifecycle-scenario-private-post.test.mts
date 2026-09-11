import { describe, expect, it } from 'vitest'

import { parsePrivatePostCollectionScenario } from './lifecycle-scenario-private-post.mts'

describe('private-post lifecycle scenario parser', () => {
  it.each([
    ['visibleCount', { visibleCount: 0, newerFilteredCount: 1, limit: 1 }],
    ['newerFilteredCount', { visibleCount: 1, newerFilteredCount: 0, limit: 1 }],
    ['limit', { visibleCount: 1, newerFilteredCount: 1, limit: 0 }],
  ])('fails closed for an invalid %s precondition', (key, preconditions) => {
    expect(() =>
      parsePrivatePostCollectionScenario({
        preconditions,
        action: { type: 'fetch-first-page' },
        serverOutcome: {},
      }),
    ).toThrow(`invalid ${key}`)
  })
})
