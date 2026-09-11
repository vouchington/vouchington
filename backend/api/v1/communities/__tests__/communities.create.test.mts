import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserWithAge, createRandomString } from '@voucha/test-helpers'

describe('communities', () => {
  const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000

  describe('Communities List Routes', () => {
    describe('POST /api/v1/communities', () => {
      it('returns 401 without auth', async () => {
        const request = createRequest()
        await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({ name: 'Test', slug: `test-${createRandomString(8)}` })
          .expect(401)
      })

      it('returns 422 for a name with fewer than 3 words', async () => {
        const creator = await createTestUserWithAge(EIGHT_DAYS_MS)
        const request = createRequest()
        await request.authenticateAs(creator)
        await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({ name: 'Only Two' })
          .expect(422)
      })

      it('auto-generates slug with base36 suffix when not provided', async () => {
        const creator = await createTestUserWithAge(EIGHT_DAYS_MS)
        const random = createRandomString(8)
        const request = createRequest()
        await request.authenticateAs(creator)
        const response = await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({ name: `Auto Slug Test ${random}` })
          .expect(201)
        // Slug should include the name portion and end with a base36 random suffix
        expect(response.body.community.slug).toMatch(/^auto-slug-test-[a-z0-9-]+-[a-z0-9]+$/)
      })

      it('creates community and returns 201 with community (free user)', async () => {
        const creator = await createTestUserWithAge(EIGHT_DAYS_MS)
        const random = createRandomString(8)
        const slug = `new-community-${random}`
        const name = `New Community ${random}`

        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({ name, slug, visibility: 'public' })
          .expect(201)

        expect(response.body.community).toHaveProperty('id')
        expect(response.body.community.name).toBe(name)
        expect(response.body.community.slug).toBe(slug)
      })

      it('converts boolean fields to dates on creation', async () => {
        const creator = await createTestUserWithAge(EIGHT_DAYS_MS)
        const random = createRandomString(8)

        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({
            name: `Bool Test ${random}`,
            slug: `bool-test-${random}`,
            visibility: 'public',
            member_invites_allowed_at: true,
            post_approval_required_at: true,
          })
          .expect(201)

        const community = response.body.community
        expect(community.member_invites_allowed_at).not.toBeNull()
        expect(community.post_approval_required_at).not.toBeNull()
      })

      it('disables member invites and post approval when false', async () => {
        const plusUser = await createTestUserWithAge(EIGHT_DAYS_MS)
        const random = createRandomString(8)

        const request = createRequest()
        await request.authenticateAs(plusUser)

        const response = await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({
            name: `No Invites ${random}`,
            slug: `no-invites-${random}`,
            visibility: 'public',
            member_invites_allowed_at: false,
            post_approval_required_at: false,
          })
          .expect(201)

        const community = response.body.community
        expect(community.member_invites_allowed_at).toBeNull()
        expect(community.post_approval_required_at).toBeNull()
      })

      it('creates community with list_type=follow', async () => {
        const plusUser = await createTestUserWithAge(EIGHT_DAYS_MS)
        const random = createRandomString(8)

        const request = createRequest()
        await request.authenticateAs(plusUser)

        const response = await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({
            name: `Follow List ${random}`,
            slug: `follow-list-create-${random}`,
            list_type: 'follow',
          })
          .expect(201)

        expect(response.body.community.list_type).toBe('follow')
      })

      it('creates community with member_roster_visibility', async () => {
        const plusUser = await createTestUserWithAge(EIGHT_DAYS_MS)
        const random = createRandomString(8)

        const request = createRequest()
        await request.authenticateAs(plusUser)

        const response = await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({
            name: `Roster Create ${random}`,
            slug: `roster-create-${random}`,
            member_roster_visibility: 'members',
          })
          .expect(201)

        expect(response.body.community.member_roster_visibility).toBe('members')
      })

      it('returns 422 for invalid list_type', async () => {
        const plusUser = await createTestUserWithAge(EIGHT_DAYS_MS)
        const random = createRandomString(8)

        const request = createRequest()
        await request.authenticateAs(plusUser)

        await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({
            name: `Invalid LT ${random}`,
            slug: `invalid-lt-${random}`,
            list_type: 'invalid',
          })
          .expect(422)
      })

      it('returns 422 for invalid member_roster_visibility', async () => {
        const plusUser = await createTestUserWithAge(EIGHT_DAYS_MS)
        const random = createRandomString(8)

        const request = createRequest()
        await request.authenticateAs(plusUser)

        await request
          .post('/api/v1/communities')
          .set('Content-Type', 'application/json')
          .send({
            name: `Invalid Roster ${random}`,
            slug: `invalid-roster-${random}`,
            member_roster_visibility: 'invalid',
          })
          .expect(422)
      })
    })
  })
})
