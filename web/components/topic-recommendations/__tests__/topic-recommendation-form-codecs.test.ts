import { describe, expect, it } from 'vitest'
import {
  aliasesToText,
  hostnamesToText,
  parseAliases,
  parseHostnames,
  parseLandingPageUrls,
  landingPageUrlsToText,
  buildTopicRecommendationMutationInput,
  buildTopicRecommendationFieldsPayload,
} from '../topic-recommendation-form-codecs'

describe('aliasesToText', () => {
  it('joins an array of aliases with newlines', () => {
    expect(aliasesToText(['one', 'two', 'three'])).toBe('one\ntwo\nthree')
  })

  it('returns empty string for an empty array', () => {
    expect(aliasesToText([])).toBe('')
  })

  it('returns empty string for null', () => {
    expect(aliasesToText(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(aliasesToText(undefined)).toBe('')
  })
})

describe('hostnamesToText', () => {
  it('maps hostname objects and joins with newlines', () => {
    const hostnames = [
      { __entity_type: 'hostname' as const, id: 'h1', hostname: 'example.com' },
      { __entity_type: 'hostname' as const, id: 'h2', hostname: 'example.org' },
    ]
    expect(hostnamesToText(hostnames)).toBe('example.com\nexample.org')
  })

  it('returns empty string for an empty array', () => {
    expect(hostnamesToText([])).toBe('')
  })

  it('returns empty string for null', () => {
    expect(hostnamesToText(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(hostnamesToText(undefined)).toBe('')
  })
})

describe('parseAliases', () => {
  it('splits on newlines and trims each entry', () => {
    expect(parseAliases('  one  \n  two  \n  three  ')).toEqual(['one', 'two', 'three'])
  })

  it('filters out empty strings after trimming', () => {
    expect(parseAliases('one\n\n\ntwo')).toEqual(['one', 'two'])
  })

  it('returns empty array for empty string', () => {
    expect(parseAliases('')).toEqual([])
  })

  it('returns a single entry for a string with no newlines', () => {
    expect(parseAliases('one')).toEqual(['one'])
  })
})

describe('parseHostnames', () => {
  it('splits on newlines and trims each entry', () => {
    expect(parseHostnames('  example.com  \n  example.org  ')).toEqual([
      'example.com',
      'example.org',
    ])
  })

  it('filters out empty strings after trimming', () => {
    expect(parseHostnames('example.com\n\nexample.org')).toEqual(['example.com', 'example.org'])
  })

  it('returns empty array for empty string', () => {
    expect(parseHostnames('')).toEqual([])
  })
})

describe('parseLandingPageUrls', () => {
  it('splits on newlines and trims each entry', () => {
    expect(parseLandingPageUrls('  https://bank.com  \n  https://partner.com  ')).toEqual([
      'https://bank.com',
      'https://partner.com',
    ])
  })

  it('filters out empty strings after trimming', () => {
    expect(parseLandingPageUrls('https://bank.com\n\nhttps://partner.com')).toEqual([
      'https://bank.com',
      'https://partner.com',
    ])
  })

  it('returns empty array for empty string', () => {
    expect(parseLandingPageUrls('')).toEqual([])
  })

  it('returns a single entry for a string with no newlines', () => {
    expect(parseLandingPageUrls('https://bank.com')).toEqual(['https://bank.com'])
  })
})

describe('landingPageUrlsToText', () => {
  it('joins an array of URLs with newlines', () => {
    expect(landingPageUrlsToText(['https://bank.com', 'https://partner.com'])).toBe(
      'https://bank.com\nhttps://partner.com',
    )
  })

  it('returns empty string for an empty array', () => {
    expect(landingPageUrlsToText([])).toBe('')
  })

  it('returns empty string for null', () => {
    expect(landingPageUrlsToText(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(landingPageUrlsToText(undefined)).toBe('')
  })
})

describe('buildTopicRecommendationMutationInput', () => {
  const baseInput = {
    title: 'My Title',
    markdown: 'Some rationale',
    topic_title: 'Topic Title',
    topic_slug: 'topic-slug',
    topic_markdown: 'Topic description',
    topic_hostname: 'example.com',
    topic_hostnames: 'example.com\nexample.org',
    topic_aliases: 'alias-one\nalias-two',
    topic_type: 'topic',
    example_referral_link: '',
    landing_page_urls: '',
  }

  it('returns title when non-empty', () => {
    const result = buildTopicRecommendationMutationInput(baseInput)
    expect(result.title).toBe('My Title')
  })

  it('converts empty title to undefined', () => {
    const result = buildTopicRecommendationMutationInput({ ...baseInput, title: '' })
    expect(result.title).toBeUndefined()
  })

  it('includes markdown as-is', () => {
    const result = buildTopicRecommendationMutationInput(baseInput)
    expect(result.markdown).toBe('Some rationale')
  })

  it('delegates topic fields to buildTopicRecommendationFieldsPayload', () => {
    const result = buildTopicRecommendationMutationInput(baseInput)
    expect(result.topic_title).toBe('Topic Title')
    expect(result.topic_slug).toBe('topic-slug')
    expect(result.topic_markdown).toBe('Topic description')
    expect(result.topic_hostname).toBe('example.com')
    expect(result.topic_hostnames).toEqual(['example.com', 'example.org'])
    expect(result.topic_aliases).toEqual(['alias-one', 'alias-two'])
  })

  it('converts empty topic_markdown to undefined', () => {
    const result = buildTopicRecommendationMutationInput({ ...baseInput, topic_markdown: '' })
    expect(result.topic_markdown).toBeUndefined()
  })

  it('converts empty topic_hostname to undefined', () => {
    const result = buildTopicRecommendationMutationInput({ ...baseInput, topic_hostname: '' })
    expect(result.topic_hostname).toBeUndefined()
  })
})

describe('buildTopicRecommendationFieldsPayload', () => {
  const baseInput = {
    topic_title: 'Topic Title',
    topic_slug: 'topic-slug',
    topic_markdown: 'Topic description',
    topic_hostname: 'example.com',
    topic_hostnames: 'example.com\nexample.org',
    topic_aliases: 'alias-one\nalias-two',
    topic_type: 'topic',
    example_referral_link: '',
    landing_page_urls: '',
  }

  it('includes topic_title and topic_slug as-is', () => {
    const result = buildTopicRecommendationFieldsPayload(baseInput)
    expect(result.topic_title).toBe('Topic Title')
    expect(result.topic_slug).toBe('topic-slug')
  })

  it('converts empty topic_markdown to undefined', () => {
    const result = buildTopicRecommendationFieldsPayload({ ...baseInput, topic_markdown: '' })
    expect(result.topic_markdown).toBeUndefined()
  })

  it('converts empty topic_hostname to undefined', () => {
    const result = buildTopicRecommendationFieldsPayload({ ...baseInput, topic_hostname: '' })
    expect(result.topic_hostname).toBeUndefined()
  })

  it('parses topic_hostnames into an array', () => {
    const result = buildTopicRecommendationFieldsPayload(baseInput)
    expect(result.topic_hostnames).toEqual(['example.com', 'example.org'])
  })

  it('parses topic_aliases into an array', () => {
    const result = buildTopicRecommendationFieldsPayload(baseInput)
    expect(result.topic_aliases).toEqual(['alias-one', 'alias-two'])
  })

  it('passes through topic_type', () => {
    const result = buildTopicRecommendationFieldsPayload({
      ...baseInput,
      topic_type: 'referral_program',
    })
    expect(result.topic_type).toBe('referral_program')
  })

  it('converts empty example_referral_link to undefined', () => {
    const result = buildTopicRecommendationFieldsPayload(baseInput)
    expect(result.example_referral_link).toBeUndefined()
  })

  it('passes through non-empty example_referral_link', () => {
    const result = buildTopicRecommendationFieldsPayload({
      ...baseInput,
      example_referral_link: 'https://example.com/ref?code=abc',
    })
    expect(result.example_referral_link).toBe('https://example.com/ref?code=abc')
  })

  it('parses landing_page_urls into an array', () => {
    const result = buildTopicRecommendationFieldsPayload({
      ...baseInput,
      landing_page_urls: 'https://bank.com\nhttps://partner.com',
    })
    expect(result.landing_page_urls).toEqual(['https://bank.com', 'https://partner.com'])
  })

  it('returns empty landing_page_urls array when empty string', () => {
    const result = buildTopicRecommendationFieldsPayload(baseInput)
    expect(result.landing_page_urls).toEqual([])
  })
})
