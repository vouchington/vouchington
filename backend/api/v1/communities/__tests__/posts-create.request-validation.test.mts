import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createRandomString,
  createTestUserWithAge,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

// An authenticated JSON null used to throw inside isHoneypotTriggered before
// validateRequestContract, and the API mapped that TypeError to 500.
describe('POST /api/v1/communities/:idOrSlug/posts request contract validation', () => {
  it('returns 422 for an authenticated JSON null body', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `posts-create-rv-422-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)
    expect(response.text).not.toMatch(/TypeError|honeypot/i)
  })

  it('returns 401 (not 422) for a JSON null body when unauthenticated', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `posts-create-rv-401-${random}`,
    })

    const response = await createRequest()
      .post(`/api/v1/communities/${community.slug}/posts`)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })

  it('validates supplied honeypot bodies before returning fake creation success', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `posts-create-hp-rv-422-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .post(`/api/v1/communities/${community.slug}/posts`)
      .send({ hp_website: 'http://spam.com', unrecognized: true })
      .expect(422)
  })
})
