import { describe, expect, it } from 'vitest'

import { requiredMockCall } from './required-mock-call.mts'

describe('requiredMockCall', () => {
  it('returns the indexed call when it exists', () => {
    expect(requiredMockCall([['first'], ['second']], 1)).toEqual(['second'])
  })

  it('fails clearly when the mock was never called', () => {
    expect(() => requiredMockCall([], 0)).toThrow('Expected mock call at index 0; received 0 calls')
  })
})
