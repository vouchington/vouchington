import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { holdQueueBulkAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { getPostByAny } from '@services/posts'
import { getTopicByAny } from '@services/topics'
import { getUrlByAny } from '@services/urls'
import { getReferralProgramAttributes } from '@services/topics/referral-programs'
import { getCardAttributes } from '@services/topics/cards'
import { ENTITY_LISTENERS_URL_CREATED_JOB } from '../../queues/background/enqueues/entity-listeners-jobs.mts'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import type { Topic } from '@services/topics/types'
import type { PrivateUser } from '@voucha/types/entities/user'
import { approveTopicRecommendation, createTopicRecommendation } from './index.mts'
import {
  getRegisteredRecommendationApprovedHandler,
  registerRecommendationApprovedHandler,
} from './recommendation-approved-handler-registry.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('typed-recommendations', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    await import('../user-import-export/register-auto-follow-on-approval-handler.mts')
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })

  describe('referral_program recommendations', () => {
    it('creates a referral_program recommendation with example_referral_link', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, WEB_PROVENANCE, {
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
        createTopicRecommendation(user, WEB_PROVENANCE, {
          markdown: `Missing referral link ${random}`,
          topic_title: `Missing Referral Link Topic ${random}`,
          topic_slug: `missing-referral-link-topic-${Date.now()}-${random}`,
          topic_type: 'referral_program',
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('approving a referral_program recommendation creates referral_program_topics extension row', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, WEB_PROVENANCE, {
        markdown: `Approve referral program ${random}`,
        topic_title: `Approvable Referral Program ${random}`,
        topic_slug: `approvable-referral-program-${Date.now()}-${random}`,
        topic_type: 'referral_program',
        example_referral_link: `https://example.com/ref-${random}`,
      })

      const result = await approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation)
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
      const recommendation = await createTopicRecommendation(user, WEB_PROVENANCE, {
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
        createTopicRecommendation(user, WEB_PROVENANCE, {
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
        createTopicRecommendation(user, WEB_PROVENANCE, {
          markdown: `Empty landing pages ${random}`,
          topic_title: `Empty Landing Pages Topic ${random}`,
          topic_slug: `empty-landing-pages-topic-${Date.now()}-${random}`,
          topic_type: 'card',
          landing_page_urls: [],
        }),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('approving a card recommendation creates card_topics extension row', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, WEB_PROVENANCE, {
        markdown: `Approve card ${random}`,
        topic_title: `Approvable Card Topic ${random}`,
        topic_slug: `approvable-card-topic-${Date.now()}-${random}`,
        topic_type: 'card',
        landing_page_urls: [`https://bank.example.com/apply-${random}`],
      })

      const result = await approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation)
      expect(result.topic_type).toBe('card')

      const createdTopic = await getTopicByAny(result.topic_id)
      expect(createdTopic?.topic_type).toBe('card')

      const attributes = await getCardAttributes(createdTopic as Topic)
      expect(attributes).not.toBeNull()
    })

    it('waits for URL-created bulk admission after recommendation approval commits', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const landingPageUrl = `https://admission-${random}.example.com/cards`
      const recommendation = await createTopicRecommendation(user, WEB_PROVENANCE, {
        markdown: `Admission boundary ${random}`,
        topic_title: `Admission Boundary ${random}`,
        topic_slug: `admission-boundary-${Date.now()}-${random}`,
        topic_type: 'card',
        landing_page_urls: [landingPageUrl],
      })
      const admission = holdQueueBulkAdmission(
        entitiesListeners,
        ENTITY_LISTENERS_URL_CREATED_JOB.name,
        data => typeof data === 'object' && data !== null && 'id' in data,
      )
      const previousApprovedHandler = getRegisteredRecommendationApprovedHandler()
      const handlerFailure = new Error('Recommendation-approved handler failed')
      const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
      let approvedHandlerCalled = false
      registerRecommendationApprovedHandler(async () => {
        approvedHandlerCalled = true
        throw handlerFailure
      })
      let settled = false
      const operation = approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation).finally(
        () => {
          settled = true
        },
      )
      let admittedJobs: Awaited<typeof admission.admitted> = []
      let admissionStarted = false
      try {
        const entered = await Promise.race([
          admission.entered.then(() => true),
          operation.then(() => false),
        ])
        admissionStarted = entered
        expect(entered).toBe(true)

        const committed = await getPostByAny(recommendation.id)
        expect(committed?.topic_recommendation?.status).toBe('approved')
        const persistedUrl = await getUrlByAny(landingPageUrl)
        expect(persistedUrl).not.toBeNull()
        expect(approvedHandlerCalled).toBe(true)
        expect(settled).toBe(false)

        admission.release()
        const [result, jobs] = await Promise.all([operation, admission.admitted])
        admittedJobs = jobs
        expect(result.topic_type).toBe('card')
        expect(approvedHandlerCalled).toBe(true)
        expect(
          sentryCaptureExceptionMock.mock.calls
            .slice(reportsBefore)
            .filter(([error]) => error === handlerFailure),
        ).toHaveLength(1)
        expect(jobs).toHaveLength(1)
        expect(jobs[0]).toMatchObject({
          name: ENTITY_LISTENERS_URL_CREATED_JOB.name,
          data: { id: persistedUrl!.id },
        })
      } finally {
        admission.release()
        try {
          await operation.catch(() => undefined)
          if (admissionStarted) admittedJobs = await admission.admitted.catch(() => [])
          await Promise.all(admittedJobs.map(job => job.remove()))
        } finally {
          try {
            registerRecommendationApprovedHandler(previousApprovedHandler)
          } finally {
            admission.restore()
          }
        }
      }
    })
  })

  describe('generic topic recommendations (default)', () => {
    it('defaults topic_type to topic when not specified', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, WEB_PROVENANCE, {
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
      const recommendation = await createTopicRecommendation(user, WEB_PROVENANCE, {
        markdown: `DB field check ${random}`,
        topic_title: `DB Field Check Topic ${random}`,
        topic_slug: `db-field-check-topic-${Date.now()}-${random}`,
      })

      const loaded = await getPostByAny(recommendation.id)
      expect(loaded?.topic_recommendation?.topic_type).toBe('topic')
    })
  })
})
