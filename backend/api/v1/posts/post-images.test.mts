import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/api/test-helpers/server'
import { insertTestPost, insertTestImage, createTestUser, followUser } from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('post-images', () => {
  let admin: PrivateUser
  let creator: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    creator = await createTestUser()
    otherUser = await createTestUser()
    await followUser(otherUser, creator)
  })

  function randomSlug(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
  }

  describe('Post Images Routes', () => {
    describe('GET /api/v1/posts/:idOrSlug/images', () => {
      let getPostId: string
      let getFollowersPublicPostId: string
      let getFollowersPrivatePostId: string

      beforeAll(async () => {
        ;[getPostId, getFollowersPublicPostId, getFollowersPrivatePostId] = await Promise.all([
          insertTestPost({
            title: 'Post No Images',
            slug: randomSlug('post-no-images'),
            createdById: creator.id,
            markdown: 'Content',
          }),
          insertTestPost({
            title: 'Followers Public Images',
            slug: randomSlug('post-followers-public-images'),
            createdById: creator.id,
            markdown: 'Content',
            broadcast: 'followers',
          }),
          insertTestPost({
            title: 'Followers Only Images',
            slug: randomSlug('post-followers-images'),
            createdById: creator.id,
            markdown: 'Content',
            broadcast: 'followers',
            privacy: 'private',
          }),
        ])
      })

      it('should return empty array for post with no images', async () => {
        const request = createRequest()
        const response = await request.get(`/api/v1/posts/${getPostId}/images`).expect(200)
        expect(response.body.images).toEqual([])
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
        expect(response.headers.vary).toContain('Cookie')
        expect(response.headers.vary).toContain('Authorization')
      })

      it('should return images for logged-out users on followers-public posts', async () => {
        const request = createRequest()
        const response = await request
          .get(`/api/v1/posts/${getFollowersPublicPostId}/images`)
          .expect(200)
        expect(response.body.images).toEqual([])
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
        expect(response.headers.vary).toContain('Cookie')
        expect(response.headers.vary).toContain('Authorization')
      })

      it('should return 404 for logged-out users and allow followers on followers-private posts', async () => {
        const loggedOutRequest = createRequest()
        await loggedOutRequest.get(`/api/v1/posts/${getFollowersPrivatePostId}/images`).expect(404)

        const followerRequest = createRequest()
        await followerRequest.authenticateAs(otherUser)
        const response = await followerRequest
          .get(`/api/v1/posts/${getFollowersPrivatePostId}/images`)
          .expect(200)
        expect(response.body.images).toEqual([])
        expect(response.headers['cache-control']).toBeUndefined()
        expect(response.headers.vary).toBeUndefined()
      })

      it('should not set cache headers for authenticated users on public posts', async () => {
        const request = createRequest()
        await request.authenticateAs(otherUser)
        const response = await request.get(`/api/v1/posts/${getPostId}/images`).expect(200)
        expect(response.body.images).toEqual([])
        expect(response.headers['cache-control']).toBeUndefined()
        expect(response.headers.vary).toBeUndefined()
      })
    })

    describe('PUT /api/v1/posts/:idOrSlug/images', () => {
      let putPostIds: string[]
      let creatorImageIds: string[]
      let otherUserImageId: string

      beforeAll(async () => {
        // Create all posts and images upfront in parallel
        const [postIds, imgIds, otherImg] = await Promise.all([
          Promise.all(
            Array.from({ length: 8 }, (_, i) =>
              insertTestPost({
                title: `Put Images Post ${i}`,
                slug: randomSlug(`put-images-${i}`),
                createdById: creator.id,
                markdown: 'Content',
              }),
            ),
          ),
          Promise.all(Array.from({ length: 4 }, () => insertTestImage(creator.id))),
          insertTestImage(otherUser.id),
        ])
        putPostIds = postIds
        creatorImageIds = imgIds
        otherUserImageId = otherImg
      })

      it('should set images and return them ordered', async () => {
        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .put(`/api/v1/posts/${putPostIds[0]}/images`)
          .send({
            images: [
              { image_id: creatorImageIds[1], order_index: 1 },
              { image_id: creatorImageIds[0], order_index: 0 },
            ],
          })
          .expect(200)

        expect(response.body.images).toHaveLength(2)
        expect(response.body.images[0].image_id).toBe(creatorImageIds[0])
        expect(response.body.images[0].order_index).toBe(0)
        expect(response.body.images[1].image_id).toBe(creatorImageIds[1])
        expect(response.body.images[1].order_index).toBe(1)
      })

      it('should replace existing images (idempotent)', async () => {
        const request = createRequest()
        await request.authenticateAs(creator)

        // Set initial images
        await request
          .put(`/api/v1/posts/${putPostIds[1]}/images`)
          .send({ images: [{ image_id: creatorImageIds[0], order_index: 0 }] })
          .expect(200)

        // Replace with new set
        const response = await request
          .put(`/api/v1/posts/${putPostIds[1]}/images`)
          .send({ images: [{ image_id: creatorImageIds[1], order_index: 0 }] })
          .expect(200)

        expect(response.body.images).toHaveLength(1)
        expect(response.body.images[0].image_id).toBe(creatorImageIds[1])
      })

      it('should set images with captions', async () => {
        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .put(`/api/v1/posts/${putPostIds[2]}/images`)
          .send({
            images: [{ image_id: creatorImageIds[0], order_index: 0, caption: 'A nice caption' }],
          })
          .expect(200)

        expect(response.body.images[0].caption).toBe('A nice caption')
      })

      it('should clear all images with empty array', async () => {
        const request = createRequest()
        await request.authenticateAs(creator)

        await request
          .put(`/api/v1/posts/${putPostIds[3]}/images`)
          .send({ images: [{ image_id: creatorImageIds[0], order_index: 0 }] })
          .expect(200)

        const response = await request
          .put(`/api/v1/posts/${putPostIds[3]}/images`)
          .send({ images: [] })
          .expect(200)

        expect(response.body.images).toEqual([])
      })

      it('should return 422 for duplicate image_ids', async () => {
        const request = createRequest()
        await request.authenticateAs(creator)

        await request
          .put(`/api/v1/posts/${putPostIds[4]}/images`)
          .send({
            images: [
              { image_id: creatorImageIds[0], order_index: 0 },
              { image_id: creatorImageIds[0], order_index: 1 },
            ],
          })
          .expect(422)
      })

      it('should return 422 for invalid image_id', async () => {
        const request = createRequest()
        await request.authenticateAs(creator)

        await request
          .put(`/api/v1/posts/${putPostIds[4]}/images`)
          .send({ images: [{ image_id: 'not-a-uuid', order_index: 0 }] })
          .expect(422)
      })

      it('should return 400 for non-existent image', async () => {
        const request = createRequest()
        await request.authenticateAs(creator)

        await request
          .put(`/api/v1/posts/${putPostIds[5]}/images`)
          .send({ images: [{ image_id: '00000000-0000-0000-0000-000000000000', order_index: 0 }] })
          .expect(400)
      })

      it("should return 400 when creator uses another user's image on their own post", async () => {
        const request = createRequest()
        await request.authenticateAs(creator)

        await request
          .put(`/api/v1/posts/${putPostIds[5]}/images`)
          .send({ images: [{ image_id: otherUserImageId, order_index: 0 }] })
          .expect(400)
      })

      it('should return 403 for non-owner, non-admin user', async () => {
        const request = createRequest()
        await request.authenticateAs(otherUser)

        await request
          .put(`/api/v1/posts/${putPostIds[6]}/images`)
          .send({ images: [{ image_id: otherUserImageId, order_index: 0 }] })
          .expect(403)
      })

      it('should allow admin to use any image', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request
          .put(`/api/v1/posts/${putPostIds[7]}/images`)
          .send({ images: [{ image_id: creatorImageIds[0], order_index: 0 }] })
          .expect(200)

        expect(response.body.images).toHaveLength(1)
      })

      it('should return 401 for unauthenticated request', async () => {
        const request = createRequest()
        await request.put(`/api/v1/posts/${putPostIds[7]}/images`).send({ images: [] }).expect(401)
      })
    })
  })
})
