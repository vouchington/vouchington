import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getPostByAny } from '@services/posts'
import { getTopicByAny } from '@services/topics'
import { getReferralProgramAttributes } from '@services/topics/referral-programs'
import { getCardAttributes } from '@services/topics/cards'
import type { Topic } from '@services/topics/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import { approveTopicRecommendation, createTopicRecommendation } from './index.mts'

describe('typed-recommendations', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })

  describe('referral_program recommendations', () => {
    it('creates a referral_program recommendation with example_referral_link', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Referral program recommendation ${random}`,
        topic_title: `Referral Program Topic ${random}`,
        topic_slug: `referral-program-topic-${Date.now()}-${random}`,
        topic_type: 'referral_program',
        example_referral_link: `https://example.com/referral-${random}`,
      })

      expect(recommendation.post_type).toBe('topic_recommendation')
      expect(recommendation.topic_recommendation?.topic_type).toBe('referral_program')
      expect(recommendation.topic_recommendation?.example_referral_link).toBe(
        `https://example.com/referral-${random}`,
      )
      expect(recommendation.topic_recommendation?.landing_page_urls).toEqual([])
    })

    it('rejects referral_program recommendation without example_referral_link with 422', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      await expect(
        createTopicRecommendation(user, {
          markdown: `Missing referral link ${random}`,
          topic_title: `Missing Referral Link Topic ${random}`,
          topic_slug: `missing-referral-link-topic-${Date.now()}-${random}`,
          topic_type: 'referral_program',
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('approving a referral_program recommendation creates topics__referral_programs extension row', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Approve referral program ${random}`,
        topic_title: `Approvable Referral Program ${random}`,
        topic_slug: `approvable-referral-program-${Date.now()}-${random}`,
        topic_type: 'referral_program',
        example_referral_link: `https://example.com/ref-${random}`,
      })

      const result = await approveTopicRecommendation(admin, recommendation)
      expect(result.topic_type).toBe('referral_program')

      const createdTopic = await getTopicByAny(result.topic_id)
      expect(createdTopic?.topic_type).toBe('referral_program')

      const attributes = await getReferralProgramAttributes(createdTopic as Topic)
      expect(attributes).not.toBeNull()
      expect(attributes?.enabled_at).not.toBeNull()
    })
  })

  describe('card recommendations', () => {
    it('creates a card recommendation with landing_page_urls', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Card recommendation ${random}`,
        topic_title: `Card Topic ${random}`,
        topic_slug: `card-topic-${Date.now()}-${random}`,
        topic_type: 'card',
        landing_page_urls: [
          `https://bank.example.com/apply-${random}`,
          `https://bank.example.com/cards-${random}`,
        ],
      })

      expect(recommendation.post_type).toBe('topic_recommendation')
      expect(recommendation.topic_recommendation?.topic_type).toBe('card')
      expect(recommendation.topic_recommendation?.landing_page_urls).toEqual(
        expect.arrayContaining([
          `https://bank.example.com/apply-${random}`,
          `https://bank.example.com/cards-${random}`,
        ]),
      )
      expect(recommendation.topic_recommendation?.example_referral_link).toBeNull()
    })

    it('rejects card recommendation without landing_page_urls with 422', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      await expect(
        createTopicRecommendation(user, {
          markdown: `Missing landing pages ${random}`,
          topic_title: `Missing Landing Pages Topic ${random}`,
          topic_slug: `missing-landing-pages-topic-${Date.now()}-${random}`,
          topic_type: 'card',
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('rejects card recommendation with empty landing_page_urls with 422', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      await expect(
        createTopicRecommendation(user, {
          markdown: `Empty landing pages ${random}`,
          topic_title: `Empty Landing Pages Topic ${random}`,
          topic_slug: `empty-landing-pages-topic-${Date.now()}-${random}`,
          topic_type: 'card',
          landing_page_urls: [],
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('approving a card recommendation creates topics__cards extension row', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Approve card ${random}`,
        topic_title: `Approvable Card Topic ${random}`,
        topic_slug: `approvable-card-topic-${Date.now()}-${random}`,
        topic_type: 'card',
        landing_page_urls: [`https://bank.example.com/apply-${random}`],
      })

      const result = await approveTopicRecommendation(admin, recommendation)
      expect(result.topic_type).toBe('card')

      const createdTopic = await getTopicByAny(result.topic_id)
      expect(createdTopic?.topic_type).toBe('card')

      const attributes = await getCardAttributes(createdTopic as Topic)
      expect(attributes).not.toBeNull()
    })
  })

  describe('generic topic recommendations (default)', () => {
    it('defaults topic_type to topic when not specified', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Generic topic recommendation ${random}`,
        topic_title: `Generic Topic ${random}`,
        topic_slug: `generic-topic-${Date.now()}-${random}`,
      })

      expect(recommendation.topic_recommendation?.topic_type).toBe('topic')
      expect(recommendation.topic_recommendation?.example_referral_link).toBeNull()
      expect(recommendation.topic_recommendation?.landing_page_urls).toEqual([])
    })

    it('stores the post from DB with topic_type field', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `DB field check ${random}`,
        topic_title: `DB Field Check Topic ${random}`,
        topic_slug: `db-field-check-topic-${Date.now()}-${random}`,
      })

      const loaded = await getPostByAny(recommendation.id)
      expect(loaded?.topic_recommendation?.topic_type).toBe('topic')
    })
  })
})
