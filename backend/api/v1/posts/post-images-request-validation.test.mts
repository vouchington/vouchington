import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestImage, insertTestPost } from '@voucha/test-helpers'

describe('PUT /api/v1/posts/:idOrSlug/images request validation', () => {
  it('returns 403 for a non-owner before malformed image diagnostics', async () => {
    const creator = await createTestUser()
    const nonOwner = await createTestUser()
    const postId = await insertTestPost({
      title: `Image authorization ${crypto.randomUUID()}`,
      slug: `image-authorization-${crypto.randomUUID()}`,
      createdById: creator.id,
      markdown: 'Image authorization test content.',
    })
    const imageId = await insertTestImage(creator.id)
    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(creator)
    await ownerRequest
      .put(`/api/v1/posts/${postId}/images`)
      .send({ images: [{ image_id: imageId, order_index: 0 }] })
      .expect(200)

    const nonOwnerRequest = createRequest()
    await nonOwnerRequest.authenticateAs(nonOwner)
    await nonOwnerRequest.put(`/api/v1/posts/${postId}/images`).send({ images: null }).expect(403)

    expect(
      (await ownerRequest.get(`/api/v1/posts/${postId}/images`).expect(200)).body.images,
    ).toHaveLength(1)
  })

  it('rejects extra and wrongly typed image bodies without changing images or clearance', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `Image validation ${crypto.randomUUID()}`,
      slug: `image-validation-${crypto.randomUUID()}`,
      createdById: creator.id,
      markdown: 'Image validation test content.',
    })
    const imageId = await insertTestImage(creator.id)
    const request = createRequest()
    await request.authenticateAs(creator)
    await request
      .put(`/api/v1/posts/${postId}/images`)
      .send({ images: [{ image_id: imageId, order_index: 0 }] })
      .expect(200)

    const imagesBefore = (await request.get(`/api/v1/posts/${postId}/images`).expect(200)).body
      .images
    const clearanceBefore = (await request.get(`/api/v1/posts/${postId}`).expect(200)).body.post
      .clearance_status

    await request.put(`/api/v1/posts/${postId}/images`).send({ images: 'invalid' }).expect(422)
    await request
      .put(`/api/v1/posts/${postId}/images`)
      .send({ images: [], unexpected: true })
      .expect(422)

    expect((await request.get(`/api/v1/posts/${postId}/images`).expect(200)).body.images).toEqual(
      imagesBefore,
    )
    expect(
      (await request.get(`/api/v1/posts/${postId}`).expect(200)).body.post.clearance_status,
    ).toBe(clearanceBefore)
  })
})
