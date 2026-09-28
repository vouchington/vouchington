import { describe, expect, it } from 'vitest'
import { clearanceMetadataFacts } from './clearance-facts.mts'

describe('post clearance metadata guards', () => {
  it('rejects empty compensation reasons', () => {
    expect(() => clearanceMetadataFacts({ reason: '' })).toThrow('reason')
  })
})
