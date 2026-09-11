import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestTopic, insertTestImage } from '@voucha/test-helpers'

describe('Topic Image Fields', () => {
  describe('PATCH /api/v1/topics/:id — hero_image_id and logo_image_id', () => {
    it('should set hero_image_id when admin provides a valid image', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Topic Images Test ${random}`,
        slug: `topic-images-hero-${random}`,
        createdById: admin!.id,
      })

      const imageId = await insertTestImage(admin!.id)

      const request = createRequest()
      await request.authenticateAs(admin!)

      const response = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ hero_image_id: imageId })
        .expect(200)

      expect(response.body.topic.hero_image_id).toBe(imageId)
    })

    it('should set logo_image_id when admin provides a valid image', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Topic Images Test ${random}`,
        slug: `topic-images-logo-${random}`,
        createdById: admin!.id,
      })

      const imageId = await insertTestImage(admin!.id)

      const request = createRequest()
      await request.authenticateAs(admin!)

      const response = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ logo_image_id: imageId })
        .expect(200)

      expect(response.body.topic.logo_image_id).toBe(imageId)
    })

    it('should clear hero_image_id when set to null', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Topic Images Test ${random}`,
        slug: `topic-images-clear-${random}`,
        createdById: admin!.id,
      })

      const imageId = await insertTestImage(admin!.id)

      const request = createRequest()
      await request.authenticateAs(admin!)

      // First set the image
      await request.patch(`/api/v1/topics/${topicId}`).send({ hero_image_id: imageId }).expect(200)

      // Then clear it
      const response = await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ hero_image_id: null })
        .expect(200)

      expect(response.body.topic.hero_image_id).toBeNull()
    })

    it('should return 422 for an invalid UUID in hero_image_id', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Topic Images Test ${random}`,
        slug: `topic-images-invalid-${random}`,
        createdById: admin!.id,
      })

      const request = createRequest()
      await request.authenticateAs(admin!)

      await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ hero_image_id: 'not-a-uuid' })
        .expect(422)
    })

    it('should return 400 for a non-existent image', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Topic Images Test ${random}`,
        slug: `topic-images-nonexistent-${random}`,
        createdById: admin!.id,
      })

      const request = createRequest()
      await request.authenticateAs(admin!)

      await request
        .patch(`/api/v1/topics/${topicId}`)
        .send({ hero_image_id: '00000000-0000-0000-0000-000000000000' })
        .expect(400)
    })

    it('should return 403 for non-admin user', async () => {
      const creator = await createTestUser()
      const nonAdmin = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Topic Images Test ${random}`,
        slug: `topic-images-403-${random}`,
        createdById: creator!.id,
      })

      const imageId = await insertTestImage(creator!.id)

      const request = createRequest()
      await request.authenticateAs(nonAdmin!)

      await request.patch(`/api/v1/topics/${topicId}`).send({ hero_image_id: imageId }).expect(403)
    })
  })
})
