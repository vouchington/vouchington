import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { insertTestPost, createTestUser } from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/posts/:idOrSlug/clearances', () => {
  let admin: PrivateUser
  let nonAdmin: PrivateUser
  let postId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    nonAdmin = await createTestUser()
    postId = await insertTestPost({
      title: 'Clearance test post',
      slug: `clearance-test-${Date.now()}`,
      createdById: nonAdmin.id,
      markdown: 'Post for clearance override tests.',
      clearanceStatus: 'pending',
    })
  })

  it('sets clearance to in_review as admin', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'in_review' })
      .expect(200)

    expect(response.body).toEqual({ clearance_status: 'in_review' })
  })

  it('sets clearance to approved as admin', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'approved' })
      .expect(200)

    expect(response.body).toEqual({ clearance_status: 'approved' })
  })

  it('returns 403 when called by a non-admin user', async () => {
    const request = createRequest()
    await request.authenticateAs(nonAdmin)

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'in_review' })
      .expect(403)
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'in_review' })
      .expect(401)
  })

  it('returns 422 for an invalid status value', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'invalid_status' })
      .expect(422)
  })

  it('returns 415 for non-JSON content type', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .set('Content-Type', 'text/plain')
      .send('status=in_review')
      .expect(415)
  })
})
