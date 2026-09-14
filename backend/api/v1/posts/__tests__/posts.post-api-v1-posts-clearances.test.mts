import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertTestPost, createTestUser } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'

import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/posts/:idOrSlug/clearances', () => {
  let admin: PrivateUser
  let siteModerator: PrivateUser
  let nonAdmin: PrivateUser
  let postId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    siteModerator = await createTestUser()
    await addUserRole(siteModerator.id, 'moderator')
    nonAdmin = await createTestUser()
    postId = await insertTestPost({
      title: 'Clearance test post',
      slug: `clearance-test-${Date.now()}`,
      createdById: nonAdmin.id,
      markdown: 'Post for clearance override tests.',
      clearanceStatus: 'pending',
    })
  })

  it('sets a platform override to in_review as admin with a public reason code', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'in_review', reason_code: 'staff_reviewed' })
      .expect(200)

    expect(response.body).toEqual({ clearance_status: 'in_review' })
  })

  it('allows a site moderator to make a platform clearance override', async () => {
    const request = createRequest()
    await request.authenticateAs(siteModerator)

    const response = await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'approved', reason_code: 'staff_approved' })
      .expect(200)

    expect(response.body).toEqual({ clearance_status: 'approved' })
  })

  it('returns 403 when called by a non-staff user', async () => {
    const request = createRequest()
    await request.authenticateAs(nonAdmin)

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'in_review', reason_code: 'staff_reviewed' })
      .expect(403)
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'in_review', reason_code: 'staff_reviewed' })
      .expect(401)
  })

  it('returns 422 for an invalid status value', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'invalid_status', reason_code: 'staff_reviewed' })
      .expect(422)
  })

  it('requires a stable public reason code for every platform override', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .send({ status: 'in_review' })
      .expect(422)
  })

  it('returns 415 for non-JSON content type', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/posts/${postId}/clearances`)
      .set('Content-Type', 'text/plain')
      .send('status=in_review&reason_code=staff_reviewed')
      .expect(415)
  })
})
