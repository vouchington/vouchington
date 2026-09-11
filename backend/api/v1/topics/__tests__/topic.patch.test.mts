import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'

describe('Topic PATCH Routes', () => {
  describe('PATCH /api/v1/topics/:idOrSlug', () => {
    it('should update topic when user is admin', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Original Name ${random}`,
        slug: `original-slug-${random}`,
        createdById: admin!.id,
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      const updatedName = `Updated Name ${random}`
      const response = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ name: updatedName })
        .expect(200)

      expect(response.body.topic.name).toBe(updatedName)
    })

    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-patch-401-${random}`,
        createdById: user!.id,
      })
      const request = createRequest()
      await request.patch(`/api/v1/topics/${topicId}`).send({ name: 'Updated Name' }).expect(401)
    })

    it('should return 403 when user is not admin', async () => {
      const creator = await createTestUser()
      const otherUser = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-patch-403-${random}`,
        createdById: creator!.id,
      })
      const request = createRequest()
      await request.authenticateAs(otherUser!)

      await request.patch(`/api/v1/topics/${topicId}`).send({ name: 'Updated Name' }).expect(403)
    })

    it('should set rewards_program_id on a topic', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-rp-${random}`,
        createdById: admin!.id,
      })
      const rewardsProgramId = await insertTestTopic({
        name: `Rewards Program ${random}`,
        slug: `rewards-program-rp-${random}`,
        createdById: admin!.id,
        topicType: 'rewards_program',
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      // Create the rewards_program extension row
      await request
        .patch(`/api/v1/topics/${rewardsProgramId}/rewards-program`)
        .send({ company_id: null })
        .expect(200)

      const response = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ rewards_program_id: rewardsProgramId })
        .expect(200)

      expect(response.body.topic.rewards_program_id).toBe(rewardsProgramId)
    })

    it('should set referral_program_id on a topic and return it in topic detail', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Card Topic ${random}`,
        slug: `test-card-topic-rp-${random}`,
        createdById: admin!.id,
        topicType: 'card',
      })
      const referralProgramId = await insertTestTopic({
        name: `Referral Program ${random}`,
        slug: `referral-program-rp-${random}`,
        createdById: admin!.id,
        topicType: 'referral_program',
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      // Create the referral_program extension row
      await request
        .patch(`/api/v1/topics/${referralProgramId}/referral-program`)
        .send({ company_id: null })
        .expect(200)

      const patchResponse = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ referral_program_id: referralProgramId })
        .expect(200)

      expect(patchResponse.body.topic.referral_program_id).toBe(referralProgramId)

      // Verify it appears in the topic detail GET response
      const getResponse = await request.get(`/api/v1/topics/${topicId}`).expect(200)
      expect(getResponse.body.topic.referral_program_id).toBe(referralProgramId)
    })

    it('should return 422 for invalid rewards_program_id', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-rp-422-${random}`,
        createdById: admin!.id,
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      // A valid UUID but not a rewards program
      await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ rewards_program_id: '00000000-0000-7000-8000-000000000099' })
        .expect(422)
    })

    it('should return 422 for invalid referral_program_id', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-ref-422-${random}`,
        createdById: admin!.id,
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      // A valid UUID but not a referral program
      await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ referral_program_id: '00000000-0000-7000-8000-000000000099' })
        .expect(422)
    })

    it('should allow clearing rewards_program_id with null', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-rp-null-${random}`,
        createdById: admin!.id,
      })
      const rewardsProgramId = await insertTestTopic({
        name: `Rewards Program ${random}`,
        slug: `rewards-program-null-${random}`,
        createdById: admin!.id,
        topicType: 'rewards_program',
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      await request
        .patch(`/api/v1/topics/${rewardsProgramId}/rewards-program`)
        .send({ company_id: null })
        .expect(200)

      // Set then clear
      await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ rewards_program_id: rewardsProgramId })
        .expect(200)

      const response = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ rewards_program_id: null })
        .expect(200)

      expect(response.body.topic.rewards_program_id).toBeNull()
    })

    it('should return 400 when attempting to change topic_type for an rss_feed topic', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Source Topic ${random}`,
        slug: `source-topic-type-guard-${random}`,
        createdById: admin!.id,
        topicType: 'rss_feed',
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      const response = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ topic_type: 'card' })
        .expect(400)

      expect(response.body.message).toBe('Cannot change topic type for source topics')
    })

    it('should allow idempotent PATCH with the same topic_type for rss_feed topics', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Source Topic Idempotent ${random}`,
        slug: `source-topic-idempotent-${random}`,
        createdById: admin!.id,
        topicType: 'rss_feed',
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      await request.patch(`/api/v1/topics/${topicId}`).send({ topic_type: 'rss_feed' }).expect(200)
    })

    it('should return 422 when attempting to change topic_type to rss_feed', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Regular Topic ${random}`,
        slug: `regular-topic-type-guard-${random}`,
        createdById: admin!.id,
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      const response = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ topic_type: 'rss_feed' })
        .expect(422)

      expect(response.body.message).toBe('Source topics can only be created by ingesting a URL')
    })
  })
})
