import { describe, expect, it } from 'vitest'
import { commentPlaceholderConfig } from '@services/comments/placeholder-config'
import { commentPlaceholderRegistryEntry } from './registry-comment-placeholder-entry.mts'

describe('comment placeholder registry entry', () => {
  it('registers the walk and look-down bounds as positive integers for developers', () => {
    expect(Object.keys(commentPlaceholderRegistryEntry.fields).toSorted()).toEqual(
      Object.keys(commentPlaceholderConfig.defaultFields).toSorted(),
    )
    expect(commentPlaceholderRegistryEntry.fields.descendant_max_depth).toMatchObject({
      minValue: 1,
      maxValue: 20,
      integer: true,
    })
    expect(commentPlaceholderRegistryEntry.access.update_roles).toEqual(['developer'])
  })
})
