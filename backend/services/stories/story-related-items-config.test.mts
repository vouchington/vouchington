import { describe, it, expect } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  DEFAULT_STORY_RELATED_ITEMS_CONFIG,
  getStoryRelatedItemsConfig,
  storyRelatedItemsConfig,
} from './story-related-items-config.mts'

describe('story related items config', () => {
  it('defaults to three and reads bounded preview overrides', () => {
    expect(getStoryRelatedItemsConfig()).toEqual(DEFAULT_STORY_RELATED_ITEMS_CONFIG)
    for (const preview_limit of [1, 2, 3]) {
      const restore = overrideDynamicConfigFieldsForTest(storyRelatedItemsConfig, { preview_limit })
      try {
        expect(getStoryRelatedItemsConfig()).toEqual({ preview_limit })
      } finally {
        restore()
      }
    }
  })

  it.each([0, 1.5, 4])('falls back for invalid runtime preview limit %s', preview_limit => {
    const restore = overrideDynamicConfigFieldsForTest(storyRelatedItemsConfig, { preview_limit })
    try {
      expect(getStoryRelatedItemsConfig()).toEqual(DEFAULT_STORY_RELATED_ITEMS_CONFIG)
    } finally {
      restore()
    }
  })
})
