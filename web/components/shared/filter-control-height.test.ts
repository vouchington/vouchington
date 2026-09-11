import { describe, it, expect } from 'vitest'
import { FILTER_CONTROL_HEIGHT } from './filter-control-height'

describe('FILTER_CONTROL_HEIGHT', () => {
  it('is the shared filter-row control height', () => {
    expect(FILTER_CONTROL_HEIGHT).toBe('h-11 sm:h-9')
  })
})
