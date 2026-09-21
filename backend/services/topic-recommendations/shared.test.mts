import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  assertValidCreateTopicRecommendationInput,
  assertValidTopicRecommendationInput,
  normalizeTopicRecommendationValues,
} from './shared.mts'

describe('shared', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('assertValidTopicRecommendationInput', () => {
    it('rejects invalid topic_type with 422', () => {
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          topic_type: 'invalid' as 'topic',
        }),
      ).toThrow(expect.objectContaining({ status: 422 }))
    })

    it('accepts valid topic_type values', () => {
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'x',
          topic_title: 'T',
          topic_slug: 'sl',
          topic_type: 'topic',
        }),
      ).not.toThrow()
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'x',
          topic_title: 'T',
          topic_slug: 'sl',
          topic_type: 'referral_program',
        }),
      ).not.toThrow()
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'x',
          topic_title: 'T',
          topic_slug: 'sl',
          topic_type: 'card',
        }),
      ).not.toThrow()
    })

    it('accepts a protocol-prefixed topic_hostname and strips the protocol', () => {
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          topic_hostname: 'https://www.chase.com/',
        }),
      ).not.toThrow()
    })

    it('rejects an unparseable topic_hostname with 422', () => {
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          topic_hostname: 'not a hostname',
        }),
      ).toThrow(expect.objectContaining({ status: 422 }))
    })

    it('rejects invalid example_referral_link URL with 422', () => {
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          example_referral_link: 'not-a-url',
        }),
      ).toThrow(expect.objectContaining({ status: 422 }))
    })

    it('accepts a valid example_referral_link URL', () => {
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          example_referral_link: 'https://example.com/referral',
        }),
      ).not.toThrow()
    })

    it('rejects invalid landing_page_url entries with 422', () => {
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          landing_page_urls: ['not-a-url'],
        }),
      ).toThrow(expect.objectContaining({ status: 422 }))
    })

    it('accepts valid landing_page_urls', () => {
      expect(() =>
        assertValidTopicRecommendationInput({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          landing_page_urls: ['https://example.com/card'],
        }),
      ).not.toThrow()
    })

    it('rejects referral_program without example_referral_link via normalizeTopicRecommendationValues', () => {
      expect(() =>
        normalizeTopicRecommendationValues({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          topic_type: 'referral_program',
        }),
      ).toThrow(expect.objectContaining({ status: 422 }))
    })

    it('rejects card without landing_page_urls via normalizeTopicRecommendationValues', () => {
      expect(() =>
        normalizeTopicRecommendationValues({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          topic_type: 'card',
        }),
      ).toThrow(expect.objectContaining({ status: 422 }))
    })

    it('rejects card with empty landing_page_urls via normalizeTopicRecommendationValues', () => {
      expect(() =>
        normalizeTopicRecommendationValues({
          markdown: 'test',
          topic_title: 'Test',
          topic_slug: 'test',
          topic_type: 'card',
          landing_page_urls: [],
        }),
      ).toThrow(expect.objectContaining({ status: 422 }))
    })
  })

  describe('assertValidCreateTopicRecommendationInput', () => {
    it.each([null, [], 'invalid'])('rejects non-object input with 422', input => {
      expect(() => assertValidCreateTopicRecommendationInput(input)).toThrow(
        expect.objectContaining({ status: 422 }),
      )
    })
  })

  describe('normalizeTopicRecommendationValues', () => {
    it('defaults topic_type to topic when not provided', () => {
      const result = normalizeTopicRecommendationValues({
        markdown: 'test markdown',
        topic_title: 'Test Title',
        topic_slug: 'test-title',
      })
      expect(result.topic_type).toBe('topic')
    })

    it('normalizes a full URL in topic_hostname to a bare hostname', () => {
      const result = normalizeTopicRecommendationValues({
        markdown: 'test markdown',
        topic_title: 'Test Title',
        topic_slug: 'test-title',
        topic_hostname: 'https://www.chase.com/',
      })
      expect(result.topic_hostname).toBe('www.chase.com')
    })

    it('deduplicates topic_hostnames that normalize to the same value', () => {
      const result = normalizeTopicRecommendationValues({
        markdown: 'test markdown',
        topic_title: 'Test Title',
        topic_slug: 'test-title',
        topic_hostnames: ['https://x.com/', 'x.com'],
      })
      expect(result.topic_hostnames).toEqual(['x.com'])
    })

    it('trims and deduplicates landing_page_urls', () => {
      const result = normalizeTopicRecommendationValues({
        markdown: 'test markdown',
        topic_title: 'Test Title',
        topic_slug: 'test-title',
        topic_type: 'card',
        landing_page_urls: [
          '  https://example.com/card  ',
          'https://example.com/card',
          'https://other.com/card',
        ],
      })
      expect(result.landing_page_urls).toEqual([
        'https://example.com/card',
        'https://other.com/card',
      ])
    })

    it('trims example_referral_link', () => {
      const result = normalizeTopicRecommendationValues({
        markdown: 'test markdown',
        topic_title: 'Test Title',
        topic_slug: 'test-title',
        topic_type: 'referral_program',
        example_referral_link: '  https://example.com/ref  ',
      })
      expect(result.example_referral_link).toBe('https://example.com/ref')
    })

    it('normalizes example_referral_link to null when empty string', () => {
      const result = normalizeTopicRecommendationValues({
        markdown: 'test markdown',
        topic_title: 'Test Title',
        topic_slug: 'test-title',
        topic_type: 'topic',
        example_referral_link: '',
      })
      expect(result.example_referral_link).toBeNull()
    })

    it('accepts referral_program with valid example_referral_link', () => {
      const result = normalizeTopicRecommendationValues({
        markdown: 'test markdown',
        topic_title: 'Test Title',
        topic_slug: 'test-title',
        topic_type: 'referral_program',
        example_referral_link: 'https://example.com/referral',
      })
      expect(result.topic_type).toBe('referral_program')
      expect(result.example_referral_link).toBe('https://example.com/referral')
    })

    it('accepts card with valid landing_page_urls', () => {
      const result = normalizeTopicRecommendationValues({
        markdown: 'test markdown',
        topic_title: 'Test Title',
        topic_slug: 'test-title',
        topic_type: 'card',
        landing_page_urls: ['https://example.com/apply'],
      })
      expect(result.topic_type).toBe('card')
      expect(result.landing_page_urls).toEqual(['https://example.com/apply'])
    })
  })

  it('user is set up', () => {
    expect(user).toBeDefined()
  })
})
