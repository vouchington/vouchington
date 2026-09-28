import { describe, it, expect } from 'vitest'
import { getDynamicConfigRegistryEntry } from './registry.mts'
import { validateChanges } from './namespace.mts'

describe('story related items admin config', () => {
  it('registers a default-three integer preview limit and rejects invalid updates', () => {
    const entry = getDynamicConfigRegistryEntry('story-related-items-config')!
    expect(entry.config.defaultFields).toEqual({ preview_limit: 3 })
    expect(entry.fields.preview_limit).toMatchObject({ min_value: 1, max_value: 3, integer: true })
    for (const preview_limit of [1, 2, 3]) {
      expect(validateChanges(entry, { preview_limit: 3 }, { preview_limit })).toEqual({
        preview_limit,
      })
    }
    for (const preview_limit of [0, 1.5, 4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => validateChanges(entry, { preview_limit: 3 }, { preview_limit })).toThrow(
        'preview_limit',
      )
    }
  })
})
