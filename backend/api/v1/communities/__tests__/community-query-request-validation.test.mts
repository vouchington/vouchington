import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

describe('community list query boundaries', () => {
  it('preserves auth and moderator checks before validating bans pagination', async () => {
    const [owner, outsider] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `query-bans-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const path = `/api/v1/communities/${community.slug}/bans?limit=oops`

    await createRequest().get(path).expect(401)
    const outsiderRequest = createRequest()
    await outsiderRequest.authenticateAs(outsider)
    await outsiderRequest.get(path).expect(403)

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest.get(path).expect(422)
    const valid = await ownerRequest
      .get(`/api/v1/communities/${community.slug}/bans?limit=2`)
      .expect(200)
    expect(valid.body.page_info).toBeDefined()
  })

  it('validates public post search queries before listing content', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `query-posts-${createRandomString(8)}`,
    })
    await createRequest().get(`/api/v1/communities/${community.slug}/posts?limit=oops`).expect(422)
    const valid = await createRequest()
      .get(`/api/v1/communities/${community.slug}/posts?limit=2&sort=hot`)
      .expect(200)
    expect(valid.body.page_info).toBeDefined()
  })
})
