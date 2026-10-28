import { describe, expect, it } from 'vitest'
import {
  buildTopicRecommendationMutationInput,
  buildTopicRecommendationFieldsPayload,
  readTopicRecommendationFormValues,
  getRecommendationFormDefaults,
} from '../topic-recommendation-form-codecs'

describe('readTopicRecommendationFormValues', () => {
  it('reads and trims text fields while preserving raw hostname lines', () => {
    const formData = new FormData()
    formData.set('title', '  Title  ')
    formData.set('markdown', '  Body  ')
    formData.set('topic_title', '  Topic  ')
    formData.set('topic_slug', '  topic-slug  ')
    formData.set('topic_hostnames', 'first.example\nsecond.example')

    expect(readTopicRecommendationFormValues(formData)).toMatchObject({
      title: 'Title',
      markdown: 'Body',
      topic_title: 'Topic',
      topic_slug: 'topic-slug',
      topic_hostnames: 'first.example\nsecond.example',
      topic_type: 'topic',
    })
  })

  it('treats a file in a text-only field as absent', () => {
    const formData = new FormData()
    formData.set('topic_title', new File(['bad'], 'title.txt'))

    expect(readTopicRecommendationFormValues(formData).topic_title).toBe('')
  })
})

describe('recommendation form defaults', () => {
  const recommendation = {
    title: 'Recommendation',
    markdown: 'Rationale',
    topic_recommendation: {
      post_id: 'post-1',
      topic_title: 'Topic',
      topic_slug: 'topic',
      topic_markdown: 'Description',
      aliases: ['one', 'two'],
      hostname_id: 'hostname-1',
      hostname: { __entity_type: 'hostname', id: 'hostname-1', hostname: 'example.com' },
      hostnames: [
        { __entity_type: 'hostname', id: 'hostname-1', hostname: 'example.com' },
        { __entity_type: 'hostname', id: 'hostname-2', hostname: 'example.org' },
      ],
      approval_error_message: null,
      status: 'pending',
      reviewed_at: null,
      reviewed_by_id: null,
      rejection_reason: null,
      created_topic_id: null,
      topic_type: 'topic',
      example_referral_link: 'https://example.com/ref',
      landing_page_urls: ['https://example.com', 'https://example.org'],
    },
  } satisfies NonNullable<Parameters<typeof getRecommendationFormDefaults>[0]>

  it('fills edit fields from the saved recommendation with newline-separated lists', () => {
    expect(getRecommendationFormDefaults(recommendation)).toEqual({
      title: 'Recommendation',
      markdown: 'Rationale',
      topic_title: 'Topic',
      topic_slug: 'topic',
      topic_markdown: 'Description',
      topic_hostname: 'example.com',
      topic_hostnames: 'example.com\nexample.org',
      topic_aliases: 'one\ntwo',
      topic_type: 'topic',
      example_referral_link: 'https://example.com/ref',
      landing_page_urls: 'https://example.com\nhttps://example.org',
    })
  })

  it('keeps empty saved lists empty in edit fields', () => {
    const defaults = getRecommendationFormDefaults({
      ...recommendation,
      topic_recommendation: {
        ...recommendation.topic_recommendation,
        aliases: [],
        hostnames: [],
        landing_page_urls: [],
      },
    })
    expect(defaults.topic_aliases).toBe('')
    expect(defaults.topic_hostnames).toBe('')
    expect(defaults.landing_page_urls).toBe('')
  })

  it.each([undefined, { title: '', markdown: '', topic_recommendation: null }])(
    'starts a new recommendation with empty fields and the topic type',
    input => {
      expect(getRecommendationFormDefaults(input)).toEqual({
        title: '',
        markdown: '',
        topic_title: '',
        topic_slug: '',
        topic_markdown: '',
        topic_hostname: '',
        topic_hostnames: '',
        topic_aliases: '',
        topic_type: 'topic',
        example_referral_link: '',
        landing_page_urls: '',
      })
    },
  )
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

  it.each([
    [
      '  one  \n\n two ',
      '  example.com \n\n example.org ',
      '  https://example.com \n\n https://example.org ',
      ['one', 'two'],
      ['example.com', 'example.org'],
      ['https://example.com', 'https://example.org'],
    ],
    ['', '', '', [], [], []],
    [
      'one',
      'example.com',
      'https://example.com',
      ['one'],
      ['example.com'],
      ['https://example.com'],
    ],
    ['  \n  ', '  \n  ', '  \n  ', [], [], []],
  ] as const)(
    'trims and filters each multiline field: %#',
    (aliases, hostnames, urls, expectedAliases, expectedHostnames, expectedUrls) => {
      const result = buildTopicRecommendationFieldsPayload({
        ...baseInput,
        topic_aliases: aliases,
        topic_hostnames: hostnames,
        landing_page_urls: urls,
      })
      expect(result.topic_aliases).toEqual(expectedAliases)
      expect(result.topic_hostnames).toEqual(expectedHostnames)
      expect(result.landing_page_urls).toEqual(expectedUrls)
    },
  )

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
