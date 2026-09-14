import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestPost,
  insertTestVoteIntegrityFlag,
  insertTestVoteWeightPenalty,
  insertTestVoteWeightPenaltyRecord,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('penalties', () => {
  const randomUsername = () => `test-vi-pen-${randomBytes(4).toString('hex')}`

  let admin: PrivateUser
  let member: PrivateUser
  let moderator: PrivateUser
  let support: PrivateUser

  beforeAll(async () => {
    ;[admin, member, moderator, support] = await Promise.all([
      createTestUser({ administrator: true, username: randomUsername() }),
      createTestUser({ administrator: false, username: randomUsername() }),
      createTestUser({ extraRoles: ['moderator'], username: randomUsername() }),
      createTestUser({ extraRoles: ['customer_support'], username: randomUsername() }),
    ])
  }, 60_000)

  function getNonAdmin(role: 'member' | 'moderator' | 'support'): PrivateUser {
    return { member, moderator, support }[role]
  }

  describe('GET /api/v1/vote-integrity/penalties', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/vote-integrity/penalties').expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.get('/api/v1/vote-integrity/penalties').expect(403)
    })

    it('returns paginated penalty list for admin', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.get('/api/v1/vote-integrity/penalties').expect(200)

      expect(res.body).toHaveProperty('results')
      expect(res.body).toHaveProperty('page_info')
      expect(Array.isArray(res.body.results)).toBe(true)
    })

    it('filters by status=active', async () => {
      await insertTestVoteWeightPenalty(member.id, admin.id)

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.get('/api/v1/vote-integrity/penalties?status=active').expect(200)

      expect(res.body.results.every((p: any) => p.revoked_at === null)).toBe(true)
    })

    it('filters by user_id', async () => {
      const testUser = await createTestUser({ username: randomUsername() })
      await insertTestVoteWeightPenalty(testUser!.id, admin.id)

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request
        .get(`/api/v1/vote-integrity/penalties?user_id=${testUser!.id}`)
        .expect(200)

      expect(res.body.results.every((p: any) => p.user_id === testUser!.id)).toBe(true)
      expect(res.body.results.length).toBeGreaterThanOrEqual(1)
    })

    it('rejects invalid status, source, user_id, source_flag_id, and cursor inputs', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/vote-integrity/penalties?status=invalid').expect(422)
      await request.get('/api/v1/vote-integrity/penalties?source=hostname').expect(422)
      await request.get('/api/v1/vote-integrity/penalties?user_id=invalid').expect(422)
      await request.get('/api/v1/vote-integrity/penalties?source_flag_id=invalid').expect(422)
      await request.get('/api/v1/vote-integrity/penalties?after=invalid').expect(400)
    })

    it('filters flag-sourced penalties by stable voting_ring reason', async () => {
      const user = await createTestUser({ username: randomUsername() })
      const expectedId = await insertTestVoteWeightPenaltyRecord({
        userId: user.id,
        createdById: admin.id,
      })
      await insertTestVoteWeightPenaltyRecord({
        userId: user.id,
        createdById: admin.id,
        reason: 'referral_link_in_post',
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/vote-integrity/penalties?user_id=${user.id}&source=flag`)
        .expect(200)
      expect(response.body.results).toEqual([expect.objectContaining({ id: expectedId })])
    }, 60_000)

    it('filters by source flag without leaking other flag penalties', async () => {
      const user = await createTestUser({ username: randomUsername() })
      const postId = await insertTestPost({
        title: `Penalty ${randomUsername()}`,
        slug: randomUsername(),
        createdById: user.id,
        markdown: 'test',
      })
      const [flagId, otherFlagId] = await Promise.all([
        insertTestVoteIntegrityFlag({ postId }),
        insertTestVoteIntegrityFlag({ postId, flagType: 'ip_correlation' }),
      ])
      const expectedId = await insertTestVoteWeightPenaltyRecord({
        userId: user.id,
        createdById: admin.id,
        sourceFlagId: flagId,
      })
      await insertTestVoteWeightPenaltyRecord({
        userId: user.id,
        createdById: admin.id,
        sourceFlagId: otherFlagId,
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(
          `/api/v1/vote-integrity/penalties?user_id=${user.id}&source=flag&source_flag_id=${flagId}`,
        )
        .expect(200)
      expect(response.body.results).toEqual([expect.objectContaining({ id: expectedId })])
    }, 60_000)

    it('returns exact flag filter_scope and omits it from all-source responses', async () => {
      const user = await createTestUser({ username: randomUsername() })
      await insertTestVoteWeightPenaltyRecord({ userId: user.id, createdById: admin.id })
      const request = createRequest()
      await request.authenticateAs(admin)

      const filtered = await request
        .get(`/api/v1/vote-integrity/penalties?user_id=${user.id}&source=flag`)
        .expect(200)
      expect(filtered.body.filter_scope).toEqual({ source: 'flag', source_flag_id: null })
      const sourceFlagId = uuidv7()
      const oneFlag = await request
        .get(
          `/api/v1/vote-integrity/penalties?user_id=${user.id}&source=flag&source_flag_id=${sourceFlagId}`,
        )
        .expect(200)
      expect(oneFlag.body.filter_scope).toEqual({ source: 'flag', source_flag_id: sourceFlagId })
      const allSources = await request
        .get(`/api/v1/vote-integrity/penalties?user_id=${user.id}`)
        .expect(200)
      expect(allSources.body).not.toHaveProperty('filter_scope')
    }, 60_000)

    it('paginates without gaps or duplicates and rejects a cursor under changed filters', async () => {
      const user = await createTestUser({ username: randomUsername() })
      const ids = []
      for (let index = 0; index < 3; index += 1) {
        ids.push(
          await insertTestVoteWeightPenaltyRecord({ userId: user.id, createdById: admin.id }),
        )
      }
      const request = createRequest()
      await request.authenticateAs(admin)
      const first = await request
        .get(`/api/v1/vote-integrity/penalties?user_id=${user.id}&source=flag&limit=2`)
        .expect(200)
      const second = await request
        .get(
          `/api/v1/vote-integrity/penalties?user_id=${user.id}&source=flag&limit=2&after=${first.body.page_info.end_cursor}`,
        )
        .expect(200)
      const traversed = [...first.body.results, ...second.body.results].map(
        (penalty: { id: string }) => penalty.id,
      )
      expect(traversed).toEqual(ids.toReversed())
      expect(new Set(traversed).size).toBe(3)
      await request
        .get(
          `/api/v1/vote-integrity/penalties?user_id=${user.id}&limit=2&after=${first.body.page_info.end_cursor}`,
        )
        .expect(400)
    }, 60_000)
  })

  describe('DELETE /api/v1/vote-integrity/penalties/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.delete(`/api/v1/vote-integrity/penalties/${uuidv7()}`).expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.delete(`/api/v1/vote-integrity/penalties/${uuidv7()}`).expect(403)
    })

    it('returns 404 for unknown penalty', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete(`/api/v1/vote-integrity/penalties/${uuidv7()}`).expect(404)
    })

    it('revokes an active penalty and returns updated penalty', async () => {
      const testUser = await createTestUser({ username: randomUsername() })
      const penaltyId = await insertTestVoteWeightPenalty(testUser!.id, admin.id)

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request.delete(`/api/v1/vote-integrity/penalties/${penaltyId}`).expect(200)

      expect(res.body.penalty).toHaveProperty('id', penaltyId)
      expect(res.body.penalty.revoked_at).not.toBeNull()
      expect(res.body.penalty).toHaveProperty('revoked_by_id', admin.id)
    })

    it('allows exactly one concurrent revocation and returns 404 thereafter', async () => {
      const user = await createTestUser({ username: randomUsername() })
      const penaltyId = await insertTestVoteWeightPenalty(user.id, admin.id)
      const [request1, request2] = [createRequest(), createRequest()]
      await Promise.all([request1.authenticateAs(admin), request2.authenticateAs(admin)])
      const responses = await Promise.all([
        request1.delete(`/api/v1/vote-integrity/penalties/${penaltyId}`),
        request2.delete(`/api/v1/vote-integrity/penalties/${penaltyId}`),
      ])
      expect(responses.map(response => response.status).toSorted()).toEqual([200, 404])
      await request1.delete(`/api/v1/vote-integrity/penalties/${penaltyId}`).expect(404)
    }, 60_000)
  })

  describe('GET /api/v1/vote-integrity/penalties/:id', () => {
    it('requires administrator access', async () => {
      await createRequest().get(`/api/v1/vote-integrity/penalties/${uuidv7()}`).expect(401)
      await Promise.all(
        (['moderator', 'support', 'member'] as const).map(async role => {
          const request = createRequest()
          await request.authenticateAs(getNonAdmin(role))
          await request.get(`/api/v1/vote-integrity/penalties/${uuidv7()}`).expect(403)
        }),
      )
    }, 60_000)

    it('returns 422 for an invalid ID and 404 for an unknown penalty', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/vote-integrity/penalties/invalid').expect(422)
      await request.get(`/api/v1/vote-integrity/penalties/${uuidv7()}`).expect(404)
    }, 60_000)

    it('returns the exact authoritative penalty', async () => {
      const user = await createTestUser({ username: randomUsername() })
      const penaltyId = await insertTestVoteWeightPenalty(user.id, admin.id)
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/vote-integrity/penalties/${penaltyId}`)
        .expect(200)
      expect(response.body.penalty).toMatchObject({
        id: penaltyId,
        user_id: user.id,
        created_by_id: admin.id,
        revoked_at: null,
      })
    }, 60_000)
  })
})
