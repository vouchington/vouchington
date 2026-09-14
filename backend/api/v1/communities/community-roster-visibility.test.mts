import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

describe('Community member roster visibility setting', () => {
  it('returns community with member_roster_visibility', async () => {
    const user = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `community-get-roster-visibility-${random}`,
      member_roster_visibility: 'members',
    })

    const response = await createRequest().get(`/api/v1/communities/${community.slug}`).expect(200)

    expect(response.body.community.member_roster_visibility).toBe('members')
  })

  it('updates member_roster_visibility', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-roster-visibility-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ member_roster_visibility: 'moderators' })
      .expect(200)

    expect(response.body.community.member_roster_visibility).toBe('moderators')
  })

  it('returns 422 for invalid member_roster_visibility', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-roster-visibility-invalid-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ member_roster_visibility: 'invalid' })
      .expect(422)
  })
})
