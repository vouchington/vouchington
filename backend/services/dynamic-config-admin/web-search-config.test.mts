import { describe, it, expect } from 'vitest'
import { dynamicConfigRegistry } from './registry.mts'

describe('web search admin config', () => {
  it('registers a bounded integer chunk cap', () => {
    const entry = dynamicConfigRegistry.get('web-search-config')!
    expect(entry.config.defaultFields).toEqual({ chunk_cap: 1_000 })
    expect(entry.fields.chunk_cap).toMatchObject({ minValue: 1, maxValue: 10_000, integer: true })
  })
})
