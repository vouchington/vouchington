import { describe, expect, it } from 'vitest'
import {
  buildEditableState,
  editableStateMatchesPost,
  buildTopicRecommendationUpdatePayload,
  type EditableState,
  type TopicRecommendationEditablePost,
} from '../topic-recommendation-editable-state'

const makePost = (
  overrides: Partial<NonNullable<TopicRecommendationEditablePost['topic_recommendation']>> = {},
): TopicRecommendationEditablePost => ({
  title: 'Post Title',
  markdown: 'Post markdown',
  declared_language: null,
  lingua_rs_detected_language: null,
  topic_recommendation: {
    post_id: 'post-1',
    topic_title: 'Topic Title',
    topic_slug: 'topic-slug',
    topic_markdown: 'Topic description',
    aliases: ['alias-one', 'alias-two'],
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
    example_referral_link: null,
    landing_page_urls: [],
    ...overrides,
  },
})

function makeEditableState(overrides?: Partial<EditableState>): EditableState {
  return {
    topic_title: 'Title',
    topic_slug: 'slug',
    topic_markdown: '',
    topic_hostname: '',
    topic_hostnames: '',
    topic_aliases: '',
    rejection_reason: '',
    topic_type: 'topic',
    example_referral_link: '',
    landing_page_urls: '',
    ...overrides,
  }
}

describe('buildEditableState', () => {
  it('produces correct EditableState shape from a post with topic_recommendation', () => {
    const post = makePost()
    const state = buildEditableState(post)

    expect(state.topic_title).toBe('Topic Title')
    expect(state.topic_slug).toBe('topic-slug')
    expect(state.topic_markdown).toBe('Topic description')
    expect(state.topic_hostname).toBe('example.com')
    expect(state.topic_hostnames).toBe('example.com\nexample.org')
    expect(state.topic_aliases).toBe('alias-one\nalias-two')
    expect(state.rejection_reason).toBe('')
    expect(state.topic_type).toBe('topic')
    expect(state.example_referral_link).toBe('')
    expect(state.landing_page_urls).toBe('')
  })

  it('includes rejection_reason from topic_recommendation', () => {
    const post = makePost({ rejection_reason: 'Does not meet criteria' })
    const state = buildEditableState(post)
    expect(state.rejection_reason).toBe('Does not meet criteria')
  })

  it('returns empty string for rejection_reason when null', () => {
    const post = makePost({ rejection_reason: null })
    const state = buildEditableState(post)
    expect(state.rejection_reason).toBe('')
  })

  it('includes typed fields from topic_recommendation', () => {
    const post = makePost({
      topic_type: 'referral_program',
      example_referral_link: 'https://example.com/ref?code=abc',
      landing_page_urls: [],
    })
    const state = buildEditableState(post)
    expect(state.topic_type).toBe('referral_program')
    expect(state.example_referral_link).toBe('https://example.com/ref?code=abc')
    expect(state.landing_page_urls).toBe('')
  })

  it('converts landing_page_urls array to newline-separated text', () => {
    const post = makePost({
      topic_type: 'card',
      example_referral_link: null,
      landing_page_urls: ['https://bank.com/card', 'https://partner.com/offer'],
    })
    const state = buildEditableState(post)
    expect(state.topic_type).toBe('card')
    expect(state.landing_page_urls).toBe('https://bank.com/card\nhttps://partner.com/offer')
  })

  it('returns empty strings for fields when topic_recommendation is null', () => {
    const post: TopicRecommendationEditablePost = {
      title: '',
      markdown: '',
      declared_language: null,
      lingua_rs_detected_language: null,
      topic_recommendation: null,
    }
    const state = buildEditableState(post)
    expect(state.topic_title).toBe('')
    expect(state.topic_slug).toBe('')
    expect(state.topic_markdown).toBe('')
    expect(state.topic_hostname).toBe('')
    expect(state.topic_hostnames).toBe('')
    expect(state.topic_aliases).toBe('')
    expect(state.rejection_reason).toBe('')
    expect(state.topic_type).toBe('topic')
    expect(state.example_referral_link).toBe('')
    expect(state.landing_page_urls).toBe('')
  })
})

describe('editableStateMatchesPost', () => {
  it('returns true when editable state matches the post defaults', () => {
    const post = makePost()
    const state = buildEditableState(post)
    expect(editableStateMatchesPost(post, state)).toBe(true)
  })

  it('returns false when topic_title differs', () => {
    const post = makePost()
    const state = buildEditableState(post)
    const modified: EditableState = { ...state, topic_title: 'Different Title' }
    expect(editableStateMatchesPost(post, modified)).toBe(false)
  })

  it('returns false when topic_slug differs', () => {
    const post = makePost()
    const state = buildEditableState(post)
    const modified: EditableState = { ...state, topic_slug: 'different-slug' }
    expect(editableStateMatchesPost(post, modified)).toBe(false)
  })

  it('returns false when topic_hostname differs', () => {
    const post = makePost()
    const state = buildEditableState(post)
    const modified: EditableState = { ...state, topic_hostname: 'different.com' }
    expect(editableStateMatchesPost(post, modified)).toBe(false)
  })

  it('returns false when topic_aliases differ', () => {
    const post = makePost()
    const state = buildEditableState(post)
    const modified: EditableState = { ...state, topic_aliases: 'alias-one' }
    expect(editableStateMatchesPost(post, modified)).toBe(false)
  })

  it('returns false when topic_type differs', () => {
    const post = makePost()
    const state = buildEditableState(post)
    const modified: EditableState = { ...state, topic_type: 'referral_program' }
    expect(editableStateMatchesPost(post, modified)).toBe(false)
  })
})

describe('buildTopicRecommendationUpdatePayload', () => {
  it('produces the correct fields payload from editable state', () => {
    const post = makePost()
    const state = buildEditableState(post)
    const payload = buildTopicRecommendationUpdatePayload(state)

    expect(payload.topic_title).toBe('Topic Title')
    expect(payload.topic_slug).toBe('topic-slug')
    expect(payload.topic_markdown).toBe('Topic description')
    expect(payload.topic_hostname).toBe('example.com')
    expect(payload.topic_hostnames).toEqual(['example.com', 'example.org'])
    expect(payload.topic_aliases).toEqual(['alias-one', 'alias-two'])
    expect(payload.topic_type).toBe('topic')
    expect(payload.example_referral_link).toBeUndefined()
    expect(payload.landing_page_urls).toEqual([])
  })

  it('trims topic_hostname via the codec', () => {
    const state = makeEditableState({ topic_hostname: '  example.com  ' })
    const payload = buildTopicRecommendationUpdatePayload(state)
    expect(payload.topic_hostname).toBe('example.com')
  })

  it('converts empty topic_markdown to undefined', () => {
    const state = makeEditableState({ topic_markdown: '' })
    const payload = buildTopicRecommendationUpdatePayload(state)
    expect(payload.topic_markdown).toBeUndefined()
  })

  it('converts empty topic_hostname to undefined after trimming', () => {
    const state = makeEditableState({ topic_hostname: '   ' })
    const payload = buildTopicRecommendationUpdatePayload(state)
    expect(payload.topic_hostname).toBeUndefined()
  })

  it('passes through example_referral_link for referral_program', () => {
    const state = makeEditableState({
      topic_type: 'referral_program',
      example_referral_link: 'https://example.com/ref?code=abc',
    })
    const payload = buildTopicRecommendationUpdatePayload(state)
    expect(payload.topic_type).toBe('referral_program')
    expect(payload.example_referral_link).toBe('https://example.com/ref?code=abc')
  })

  it('parses landing_page_urls text into array for card', () => {
    const state = makeEditableState({
      topic_type: 'card',
      landing_page_urls: 'https://bank.com/card\nhttps://partner.com/offer',
    })
    const payload = buildTopicRecommendationUpdatePayload(state)
    expect(payload.topic_type).toBe('card')
    expect(payload.landing_page_urls).toEqual([
      'https://bank.com/card',
      'https://partner.com/offer',
    ])
  })
})
