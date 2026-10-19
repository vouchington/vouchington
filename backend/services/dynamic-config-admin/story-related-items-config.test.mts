import { describe, it, expect } from 'vitest'
import { dynamicConfigRegistry } from './registry.mts'

describe('story related items admin config', () => {
  it('registers a default-three integer preview limit with bounds', () => {
    const entry = dynamicConfigRegistry.get('story-related-items-config')!
    expect(entry.config.defaultFields).toEqual({ preview_limit: 3 })
    expect(entry.fields.preview_limit).toMatchObject({ minValue: 1, maxValue: 3, integer: true })
  })
})
