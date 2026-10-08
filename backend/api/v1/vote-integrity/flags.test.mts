import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import {
  arrangeVoteIntegrityFlagPage,
  createOwnedIntegrityFlagQuery,
} from '@voucha/test-helpers/integrity-flag-page-fixtures'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { createVoteIntegrityFlag } from '@services/vote-integrity/create-flag'
import type { PrivateUser } from '@services/users/types'

describe('flags', () => {
  const randomUsername = () => `test-vi-flags-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-flags-${randomBytes(6).toString('hex')}`

  let admin: PrivateUser
  let member: PrivateUser
  let moderator: PrivateUser
  let creatorUser: PrivateUser
  let support: PrivateUser

  beforeAll(async () => {
    ;[admin, member, moderator, creatorUser, support] = await Promise.all([
      createTestUser({ administrator: true, username: randomUsername() }),
      createTestUser({ administrator: false, username: randomUsername() }),
      createTestUser({ extraRoles: ['moderator'], username: randomUsername() }),
      createTestUserDirect({ username: randomUsername() }),
      createTestUser({ extraRoles: ['customer_support'], username: randomUsername() }),
    ])
  })

  const ownedFlagQuery = createOwnedIntegrityFlagQuery('vote-integrity-flags')

  async function adminRequest() {
    const request = createRequest()
    await request.authenticateAs(admin)
    return request
  }

  function getNonAdmin(role: 'member' | 'moderator' | 'support'): PrivateUser {
    return { member, moderator, support }[role]
  }

  function makePost(slug: string): Promise<string> {
    return insertTestPost({
      title: `Flags Test ${slug}`,
      slug,
      createdById: creatorUser.id,
      markdown: 'test',
    })
  }

  describe('GET /api/v1/vote-integrity/flags', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/vote-integrity/flags').expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.get('/api/v1/vote-integrity/flags').expect(403)
    })

    it('returns paginated flag list for admin', async () => {
      const entityId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', entityId, 'velocity_spike', {})
      const request = await adminRequest()
      const res = await request
        .get('/api/v1/vote-integrity/flags')
        .query(ownedFlagQuery(flag!.id))
        .expect(200)

      expect(res.body.results.map((item: any) => item.id)).toEqual([flag!.id])
      expect(res.body).toHaveProperty('results')
      expect(res.body).toHaveProperty('page_info')
      expect(Array.isArray(res.body.results)).toBe(true)
    })

    it('filters by status=pending', async () => {
      const entityId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', entityId, 'velocity_spike', {})

      const request = await adminRequest()
      const res = await request
        .get('/api/v1/vote-integrity/flags')
        .query(ownedFlagQuery(flag!.id, 'pending'))
        .expect(200)

      expect(res.body.results.map((item: any) => item.id)).toEqual([flag!.id])
      expect(res.body.results.every((f: any) => f.resolved_at === null)).toBe(true)
      const opposite = await request
        .get('/api/v1/vote-integrity/flags')
        .query(ownedFlagQuery(flag!.id, 'resolved'))
        .expect(200)
      expect(opposite.body.results.map((item: any) => item.id)).not.toContain(flag!.id)
    })

    it('filters by status=resolved', async () => {
      const entityId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', entityId, 'velocity_spike', {})
      const patchRequest = createRequest()
      await patchRequest.authenticateAs(admin)
      await patchRequest
        .patch(`/api/v1/vote-integrity/flags/${flag!.id}`)
        .send({ resolution: 'dismissed' })
        .expect(200)

      const request = await adminRequest()
      const res = await request
        .get('/api/v1/vote-integrity/flags')
        .query(ownedFlagQuery(flag!.id, 'resolved'))
        .expect(200)

      expect(res.body.results.map((item: any) => item.id)).toEqual([flag!.id])
      expect(res.body.results.every((item: any) => item.resolved_at !== null)).toBe(true)
      const opposite = await request
        .get('/api/v1/vote-integrity/flags')
        .query(ownedFlagQuery(flag!.id, 'pending'))
        .expect(200)
      expect(opposite.body.results.map((item: any) => item.id)).not.toContain(flag!.id)
    })

    it('returns pending and resolved flags when status is omitted', async () => {
      const pendingEntityId = await makePost(randomSlug())
      const resolvedEntityId = await makePost(randomSlug())
      const pendingFlag = await createVoteIntegrityFlag(
        'post',
        pendingEntityId,
        'velocity_spike',
        {},
      )
      const resolvedFlag = await createVoteIntegrityFlag(
        'post',
        resolvedEntityId,
        'velocity_spike',
        {},
      )
      const { pendingId, resolvedId } = await arrangeVoteIntegrityFlagPage(
        { id: pendingFlag!.id, targetId: pendingEntityId },
        { id: resolvedFlag!.id, targetId: resolvedEntityId },
      )
      const patchRequest = createRequest()
      await patchRequest.authenticateAs(admin)
      await patchRequest
        .patch(`/api/v1/vote-integrity/flags/${resolvedId}`)
        .send({ resolution: 'dismissed' })
        .expect(200)

      const request = createRequest()
      await request.authenticateAs(admin)
      const res = await request
        .get('/api/v1/vote-integrity/flags')
        .query({ ...ownedFlagQuery(resolvedId), limit: 2 })
        .expect(200)
      const ids = new Set(res.body.results.map((item: any) => item.id))

      expect(ids).toContain(pendingId)
      expect(ids).toContain(resolvedId)
      expect(res.body.results.map((item: any) => item.id)).toEqual([resolvedId, pendingId])
      expect(res.body.results[0].resolved_at).not.toBeNull()
      expect(res.body.results[1].resolved_at).toBeNull()
    })
  })

  describe('GET /api/v1/vote-integrity/flags/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/vote-integrity/flags/${uuidv7()}`).expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.get(`/api/v1/vote-integrity/flags/${uuidv7()}`).expect(403)
    })

    it('returns 404 for unknown flag', async () => {
      const request = await adminRequest()
      await request.get(`/api/v1/vote-integrity/flags/${uuidv7()}`).expect(404)
    })

    it('returns the flag for a valid ID', async () => {
      const entityId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', entityId, 'ip_correlation', {
        test: 'get-by-id',
      })

      const request = await adminRequest()
      const res = await request.get(`/api/v1/vote-integrity/flags/${flag!.id}`).expect(200)

      expect(res.body.flag).toHaveProperty('id', flag!.id)
      expect(res.body.flag).toHaveProperty('flag_type', 'ip_correlation')
    })
  })

  describe('PATCH /api/v1/vote-integrity/flags/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch(`/api/v1/vote-integrity/flags/${uuidv7()}`)
        .set('Content-Type', 'application/json')
        .expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request
        .patch(`/api/v1/vote-integrity/flags/${uuidv7()}`)
        .send({ resolution: 'dismissed' })
        .expect(403)
    })

    it('resolves a flag and returns the updated flag', async () => {
      const entityId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', entityId, 'velocity_spike', {})

      const request = await adminRequest()
      const res = await request
        .patch(`/api/v1/vote-integrity/flags/${flag!.id}`)
        .send({ resolution: 'dismissed' })
        .expect(200)

      expect(res.body.flag).toHaveProperty('id', flag!.id)
      expect(res.body.flag.resolved_at).not.toBeNull()
      expect(res.body.flag).toHaveProperty('resolution', 'dismissed')
    })

    it('returns 422 for invalid resolution value', async () => {
      const entityId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', entityId, 'ip_correlation', {})

      const request = await adminRequest()
      await request
        .patch(`/api/v1/vote-integrity/flags/${flag!.id}`)
        .send({ resolution: 'invalid_value' })
        .expect(422)
    })
  })

  describe('POST /api/v1/vote-integrity/flags/:id/penalties', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.post(`/api/v1/vote-integrity/flags/${uuidv7()}/penalties`).expect(401)
    })

    it.each(['moderator', 'support', 'member'] as const)('returns 403 for %s', async role => {
      const request = createRequest()
      await request.authenticateAs(getNonAdmin(role))
      await request.post(`/api/v1/vote-integrity/flags/${uuidv7()}/penalties`).expect(403)
    })

    it('returns penalized_user_count for a valid flag with no upvoters', async () => {
      const entityId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', entityId, 'velocity_spike', {})

      const request = await adminRequest()
      const res = await request
        .post(`/api/v1/vote-integrity/flags/${flag!.id}/penalties`)
        .expect(200)

      expect(res.body).toHaveProperty('penalized_user_count', 0)
      expect(res.body.flag).toMatchObject({
        id: flag!.id,
        resolution: 'penalized',
        resolved_by_id: admin.id,
      })

      const getRequest = createRequest()
      await getRequest.authenticateAs(admin)
      const getResponse = await getRequest
        .get(`/api/v1/vote-integrity/flags/${flag!.id}`)
        .expect(200)
      expect(getResponse.body.flag).toMatchObject({
        id: flag!.id,
        resolution: 'penalized',
        resolved_at: expect.any(String),
        resolved_by_id: admin.id,
      })
    })

    it('returns 404 for unknown flag', async () => {
      const request = await adminRequest()
      await request.post(`/api/v1/vote-integrity/flags/${uuidv7()}/penalties`).expect(404)
    })
  })
})
