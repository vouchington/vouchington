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
// saved-replies.test.mts. See backend/api/v1/communities/reference-request-validation.md for the
// 400->422 body-shape change this file pins.
describe('POST /api/v1/communities/:idOrSlug/saved-replies - request contract validation', () => {
  let mod: PrivateUser
  let community: Community

  beforeAll(async () => {
    mod = await createTestUser()
    community = await insertTestCommunity({ createdById: mod.id })
    await insertTestCommunityMember({ communityId: community.id, userId: mod.id, role: 'owner' })
  })

  it('returns 422 for a non-object JSON body before running the body/title checks', async () => {
    const request = createRequest()
    await request.authenticateAs(mod)
    await request
      .post(`/api/v1/communities/${community.slug}/saved-replies`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)
  })

  it('returns 401 (not 422) for a malformed body when unauthenticated', async () => {
    const request = createRequest()
    const response = await request
      .post(`/api/v1/communities/${community.slug}/saved-replies`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })
})
