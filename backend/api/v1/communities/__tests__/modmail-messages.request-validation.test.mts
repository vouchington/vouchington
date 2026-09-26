import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

// Covers the post-auth runtime request-contract validation added for issue #295. The authenticated
// 422 case for this operation is already covered by modmail-thread.test.mts's "returns 422 when
// body is null JSON" test; this file adds the unauthenticated companion case (see
// backend/api/v1/communities/reference-request-validation.md).
describe('POST /api/v1/communities/:idOrSlug/modmail/:conversationId/messages - request contract validation', () => {
  let member: PrivateUser
  let community: Community
  let threadId: string

  beforeAll(async () => {
    member = await createTestUser()
    community = await insertTestCommunity({ createdById: member.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })
    const setupRequest = createRequest()
    await setupRequest.authenticateAs(member)
    const resp = await setupRequest
      .post(`/api/v1/communities/${community.slug}/modmail`)
      .send({})
      .expect(201)
    threadId = resp.body.thread.id as string
  })

  it('returns 401 (not 422) for a malformed body when unauthenticated', async () => {
    const request = createRequest()
    const response = await request
      .post(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })
})
