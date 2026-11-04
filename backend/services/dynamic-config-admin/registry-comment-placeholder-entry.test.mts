import { describe, expect, it } from 'vitest'
import { commentPlaceholderConfig } from '@services/comments/placeholder-config'
import { commentPlaceholderRegistryEntry } from './registry-comment-placeholder-entry.mts'

describe('comment placeholder registry entry', () => {
  it('registers exactly the two look-down limits for operators', () => {
    expect(Object.keys(commentPlaceholderRegistryEntry.fields).toSorted()).toEqual(
      Object.keys(commentPlaceholderConfig.defaultFields).toSorted(),
    )
  })
})
