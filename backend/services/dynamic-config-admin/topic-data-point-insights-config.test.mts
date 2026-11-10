import { describe, it, expect } from 'vitest'
import { dynamicConfigRegistry } from './registry.mts'

describe('topic data point insights admin config', () => {
  it('registers bounded integer row cap and year window fields', () => {
    const entry = dynamicConfigRegistry.get('topic-data-point-insights-config')!
    expect(entry.config.defaultFields).toEqual({ row_cap: 10_000, window_years: 3 })
    expect(entry.fields.row_cap).toMatchObject({ minValue: 1, maxValue: 100_000, integer: true })
    expect(entry.fields.window_years).toMatchObject({ minValue: 1, maxValue: 10, integer: true })
  })
})
