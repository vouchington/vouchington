import { describe, it, expect } from 'vitest'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import {
  getTopicTagTabsForTopicType,
  isTopicTagSegment,
  isTopicTagSegmentForTopicType,
  topicTagTabs,
} from '../tag-relation-configs'

describe('tag-relation-configs', () => {
  describe('topicTagTabs', () => {
    it('includes a landing_page tab', () => {
      const tab = topicTagTabs.find(t => t.value === 'landing_page')
      expect(tab).toBeDefined()
      expect(tab?.predicate).toBe('landing_page')
      expect(tab?.objectType).toBe('url')
      expect(defaultTranslator(tab!.label)).toBe('Landing Page')
    })

    it('includes a terms_of_service tab', () => {
      const tab = topicTagTabs.find(t => t.value === 'terms_of_service')
      expect(tab).toBeDefined()
      expect(tab?.predicate).toBe('terms_of_service')
      expect(tab?.objectType).toBe('url')
      expect(defaultTranslator(tab!.label)).toBe('Terms of Service')
    })

    it('includes the original topic, publisher_type, and post tabs', () => {
      const values = topicTagTabs.map(t => t.value)
      expect(values).toContain('topic')
      expect(values).toContain('publisher_type')
      expect(values).toContain('post')
    })

    it('includes a category tab', () => {
      const tab = topicTagTabs.find(t => t.value === 'category')
      expect(tab).toBeDefined()
      expect(tab?.predicate).toBe('category')
      expect(tab?.objectType).toBe('topic')
      expect(defaultTranslator(tab!.label)).toBe('Categories')
    })
  })

  describe('isTopicTagSegment', () => {
    it('returns true for all topicTagTab values', () => {
      for (const tab of topicTagTabs) {
        expect(isTopicTagSegment(tab.value)).toBe(true)
      }
    })

    it('returns true for landing_page', () => {
      expect(isTopicTagSegment('landing_page')).toBe(true)
    })

    it('returns true for terms_of_service', () => {
      expect(isTopicTagSegment('terms_of_service')).toBe(true)
    })

    it('returns true for publisher_type', () => {
      expect(isTopicTagSegment('publisher_type')).toBe(true)
    })

    it('returns false for unknown segment', () => {
      expect(isTopicTagSegment('unknown')).toBe(false)
    })

    it('returns false for bare url', () => {
      expect(isTopicTagSegment('url')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isTopicTagSegment('')).toBe(false)
    })
  })

  describe('topic-type-specific tag segments', () => {
    it('includes publisher_type for source topics', () => {
      expect(getTopicTagTabsForTopicType('rss_feed').map(t => t.value)).toContain('publisher_type')
      expect(isTopicTagSegmentForTopicType('publisher_type', 'rss_feed')).toBe(true)
    })

    it('excludes publisher_type for non-source topics', () => {
      expect(getTopicTagTabsForTopicType('card').map(t => t.value)).not.toContain('publisher_type')
      expect(isTopicTagSegmentForTopicType('publisher_type', 'card')).toBe(false)
    })

    it('includes category for all topic types', () => {
      expect(getTopicTagTabsForTopicType('rss_feed').map(t => t.value)).toContain('category')
      expect(getTopicTagTabsForTopicType('card').map(t => t.value)).toContain('category')
      expect(getTopicTagTabsForTopicType(null).map(t => t.value)).toContain('category')
      expect(isTopicTagSegmentForTopicType('category', 'rss_feed')).toBe(true)
      expect(isTopicTagSegmentForTopicType('category', 'card')).toBe(true)
    })

    it('isTopicTagSegment returns true for category', () => {
      expect(isTopicTagSegment('category')).toBe(true)
    })
  })
})
