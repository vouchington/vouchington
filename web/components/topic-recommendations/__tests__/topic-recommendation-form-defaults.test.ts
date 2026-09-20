import { describe, expect, it } from 'vitest'
import { getRecommendationFormDefaults } from '../topic-recommendation-form-codecs'
import type { Post } from '@/types/posts'

function makeTopicRecommendation(
  overrides?: Partial<NonNullable<Post['topic_recommendation']>>,
): NonNullable<Post['topic_recommendation']> {
  return {
    post_id: 'post-1',
    topic_title: '',
    topic_slug: '',
    topic_markdown: null,
    aliases: [],
    hostname_id: null,
    hostname: null,
    hostnames: [],
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
  }
}

describe('getRecommendationFormDefaults', () => {
  it('returns defaults with topic_type=topic when given undefined', () => {
    const defaults = getRecommendationFormDefaults(undefined)
    expect(defaults).toEqual({
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
  })

  it('returns correct defaults from a Post with topic_recommendation', () => {
    const post: Pick<Post, 'title' | 'markdown' | 'topic_recommendation'> = {
      title: 'Post Title',
      markdown: 'Post markdown',
      topic_recommendation: makeTopicRecommendation({
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
      }),
    }

    const defaults = getRecommendationFormDefaults(post)

    expect(defaults.title).toBe('Post Title')
    expect(defaults.markdown).toBe('Post markdown')
    expect(defaults.topic_title).toBe('Topic Title')
    expect(defaults.topic_slug).toBe('topic-slug')
    expect(defaults.topic_markdown).toBe('Topic description')
    expect(defaults.topic_hostname).toBe('example.com')
    expect(defaults.topic_hostnames).toBe('example.com\nexample.org')
    expect(defaults.topic_aliases).toBe('alias-one\nalias-two')
    expect(defaults.topic_type).toBe('topic')
    expect(defaults.example_referral_link).toBe('')
    expect(defaults.landing_page_urls).toBe('')
  })

  it('returns example_referral_link from a referral_program recommendation', () => {
    const post: Pick<Post, 'title' | 'markdown' | 'topic_recommendation'> = {
      title: '',
      markdown: '',
      topic_recommendation: makeTopicRecommendation({
        topic_type: 'referral_program',
        example_referral_link: 'https://example.com/ref?code=abc',
      }),
    }

    const defaults = getRecommendationFormDefaults(post)

    expect(defaults.topic_type).toBe('referral_program')
    expect(defaults.example_referral_link).toBe('https://example.com/ref?code=abc')
  })

  it('returns landing_page_urls from a card recommendation', () => {
    const post: Pick<Post, 'title' | 'markdown' | 'topic_recommendation'> = {
      title: '',
      markdown: '',
      topic_recommendation: makeTopicRecommendation({
        topic_type: 'card',
        landing_page_urls: ['https://bank.com/card-x', 'https://partner.com/offer'],
      }),
    }

    const defaults = getRecommendationFormDefaults(post)

    expect(defaults.topic_type).toBe('card')
    expect(defaults.example_referral_link).toBe('')
    expect(defaults.landing_page_urls).toBe('https://bank.com/card-x\nhttps://partner.com/offer')
  })

  it('returns empty topic_hostname when hostname is null', () => {
    const post: Pick<Post, 'title' | 'markdown' | 'topic_recommendation'> = {
      title: '',
      markdown: '',
      topic_recommendation: makeTopicRecommendation({ hostname: null }),
    }

    const defaults = getRecommendationFormDefaults(post)
    expect(defaults.topic_hostname).toBe('')
  })
})
