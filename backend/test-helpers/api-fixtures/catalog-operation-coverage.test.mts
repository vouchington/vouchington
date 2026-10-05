import { describe, expect, it } from 'vitest'

import { hasCompleteOperationCoverage } from './catalog-operation-coverage.mts'

describe('discovered contract operation coverage', () => {
  it('accepts variant response keys when every operation is known', () => {
    expect(
      hasCompleteOperationCoverage(
        { 'GET:/api/v1/topics/:id': {}, 'POST:/api/v1/topics/:id': {} },
        new Set(['GET:/api/v1/topics/:id#success', 'POST:/api/v1/topics/:id']),
      ),
    ).toBe(true)
  })

  it('rejects catalog reuse when a contract operation is missing from the known routes', () => {
    expect(
      hasCompleteOperationCoverage(
        { 'GET:/api/v1/topics/:id': {}, 'POST:/api/v1/topics/:id': {} },
        new Set(['GET:/api/v1/topics/:id']),
      ),
    ).toBe(false)
  })
})
