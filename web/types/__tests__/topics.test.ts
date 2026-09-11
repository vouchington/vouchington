import { describe, expect, it } from 'vitest'

import {
  NON_SOURCE_TOPIC_TYPE_OPTIONS,
  getTopicTypeFromSlug,
  getTopicTypeLabel,
  getTopicTypeLabelFromSlug,
  TOPIC_TYPE_OPTIONS,
  topicTypes,
} from '../topics'

describe('getTopicTypeFromSlug', () => {
  it('maps valid slugs to TopicTypes', () => {
    expect(getTopicTypeFromSlug('card')).toBe('card')
    expect(getTopicTypeFromSlug('rewards-program')).toBe('rewards_program')
    expect(getTopicTypeFromSlug('topic')).toBe('topic')
    expect(getTopicTypeFromSlug('rewards-program-status')).toBe('rewards_program_status')
    expect(getTopicTypeFromSlug('referral-program')).toBe('referral_program')
    expect(getTopicTypeFromSlug('bank-account')).toBe('bank_account')
    expect(getTopicTypeFromSlug('source')).toBe('rss_feed')
    expect(getTopicTypeFromSlug('instance')).toBe('fediverse_instance')
  })

  it('returns undefined for invalid slugs', () => {
    expect(getTopicTypeFromSlug('invalid')).toBeUndefined()
    expect(getTopicTypeFromSlug('rss_feed')).toBeUndefined()
    expect(getTopicTypeFromSlug('')).toBeUndefined()
    expect(getTopicTypeFromSlug('retailer')).toBeUndefined()
    // Removed label-only types (consolidated into `topic`) no longer map.
    expect(getTopicTypeFromSlug('person')).toBeUndefined()
    expect(getTopicTypeFromSlug('public-figure')).toBeUndefined()
    expect(getTopicTypeFromSlug('organization')).toBeUndefined()
    expect(getTopicTypeFromSlug('brand')).toBeUndefined()
  })
})

describe('TOPIC_TYPE_OPTIONS', () => {
  it('contains every web topic type exactly once', () => {
    expect(TOPIC_TYPE_OPTIONS.map(option => option.value)).toEqual(Object.keys(topicTypes))
  })
})

describe('NON_SOURCE_TOPIC_TYPE_OPTIONS', () => {
  it('does not contain rss_feed', () => {
    expect(NON_SOURCE_TOPIC_TYPE_OPTIONS.map(opt => opt.value)).not.toContain('rss_feed')
  })

  it('does not contain fediverse_instance', () => {
    expect(NON_SOURCE_TOPIC_TYPE_OPTIONS.map(opt => opt.value)).not.toContain('fediverse_instance')
  })
})

describe('getTopicTypeLabel', () => {
  it('returns labels from the shared topic type metadata', () => {
    expect(getTopicTypeLabel('bank_account')).toBe(topicTypes.bank_account.label)
    expect(getTopicTypeLabel('rss_feed')).toBe(topicTypes.rss_feed.label)
    expect(getTopicTypeLabel('referral_program')).toBe(topicTypes.referral_program.label)
  })

  it('falls back to the raw topic type for unknown values', () => {
    expect(getTopicTypeLabel('unknown_type')).toBe('unknown_type')
  })
})

describe('getTopicTypeLabelFromSlug', () => {
  it('maps URL slugs to display labels', () => {
    expect(getTopicTypeLabelFromSlug('source')).toBe(topicTypes.rss_feed.label)
    expect(getTopicTypeLabelFromSlug('topic')).toBe(topicTypes.topic.label)
    expect(getTopicTypeLabelFromSlug('card')).toBe(topicTypes.card.label)
    expect(getTopicTypeLabelFromSlug('bank-account')).toBe(topicTypes.bank_account.label)
    expect(getTopicTypeLabelFromSlug('referral-program')).toBe(topicTypes.referral_program.label)
  })

  it('falls back to the "Topic" label for unknown slugs', () => {
    expect(getTopicTypeLabelFromSlug('unknown')).toBe(topicTypes.topic.label)
    expect(getTopicTypeLabelFromSlug('')).toBe(topicTypes.topic.label)
  })
})
