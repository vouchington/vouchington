import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

// Covers the post-auth runtime request-contract validation added for issue #295. Split out of
// modmail.test.mts so that file stays focused on route behavior. See
// backend/services/runtime-request-validation for the shared registry these tests exercise, and
// backend/api/v1/communities/reference-request-validation.md for the 400->422 body-shape change
// these tests pin.
describe('POST/PATCH /api/v1/communities/:idOrSlug/modmail - request contract validation', () => {
  let mod: PrivateUser
  let member: PrivateUser
  let community: Community
  let threadId: string

  beforeAll(async () => {
    ;[mod, member] = await Promise.all([createTestUser(), createTestUser()])
    community = await insertTestCommunity({ createdById: mod.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: mod.id, role: 'moderator' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
    ])
    const setupRequest = createRequest()
    await setupRequest.authenticateAs(member)
    const resp = await setupRequest
      .post(`/api/v1/communities/${community.slug}/modmail`)
      .send({})
      .expect(201)
    threadId = resp.body.thread.id as string
  })

  it('POST returns 422 for a non-object JSON body before running the open-thread checks', async () => {
    const request = createRequest()
    await request.authenticateAs(member)
    await request
      .post(`/api/v1/communities/${community.slug}/modmail`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)
  })

  it('POST returns 401 (not 422) for a malformed body when unauthenticated', async () => {
    const request = createRequest()
    const response = await request
      .post(`/api/v1/communities/${community.slug}/modmail`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })

  it('PATCH returns 422 for a non-object JSON body before assigning/resolving the thread', async () => {
    const request = createRequest()
    await request.authenticateAs(mod)
    await request
      .patch(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)
  })

  it('PATCH returns 401 (not 422) for a malformed body when unauthenticated', async () => {
    const request = createRequest()
    const response = await request
      .patch(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })
})
