import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

// JSON null and scalars used to throw while reading PATCH fields, before
// validateRequestContract, and the API mapped that TypeError to 500.
describe('PATCH /api/v1/communities/:idOrSlug request contract validation', () => {
  it('returns 422 for a non-object JSON body from an owner', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `community-patch-rv-422-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)
    expect(response.text).not.toMatch(/TypeError|22P02/i)

    await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send('1')
      .expect(422)
  })

  it('returns 403 for a non-object JSON body from a member', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `community-patch-rv-403-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member!.id,
      role: 'member',
    })

    const request = createRequest()
    await request.authenticateAs(member!)
    await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(403)
  })

  it('returns 401 (not 422) for a malformed body when unauthenticated', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `community-patch-rv-401-${random}`,
    })

    const response = await createRequest()
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })
})
