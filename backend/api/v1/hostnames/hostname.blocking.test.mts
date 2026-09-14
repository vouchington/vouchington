import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUserDirect,
  insertTestUrlHostname,
  insertTestPost,
  getTestPenaltiesByHostnameId,
  getTestRelationDeletedAt,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'

describe('hostname.blocking', () => {
  const rand = () => randomBytes(6).toString('hex')

  function randomHostname() {
    return `api-block-test-${rand()}.example.com`
  }

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }) as Promise<PrivateUser>,
      createTestUser({ administrator: false }) as Promise<PrivateUser>,
    ])
  }, 60_000)

  async function relatePostToUrl(creator: PrivateUser, postId: string, urlId: string) {
    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'url' && m.predicate === 'related',
    )!
    await upsertEntityRelation(creator, metadata, { id: postId }, [{ id: urlId }])
  }

  describe('PATCH /api/v1/hostnames/:id (blocking)', () => {
    it('returns 401 when unauthenticated', async () => {
      const hostnameId = await insertTestUrlHostname({ hostname: randomHostname() })
      const request = createRequest()
      await request.patch(`/api/v1/hostnames/${hostnameId}`).send({ blocked: true }).expect(401)
    }, 60_000)

    it('returns 403 when authenticated as non-admin', async () => {
      const hostnameId = await insertTestUrlHostname({ hostname: randomHostname() })
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.patch(`/api/v1/hostnames/${hostnameId}`).send({ blocked: true }).expect(403)
    }, 60_000)

    it('returns 404 for a non-existent hostname', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.patch(`/api/v1/hostnames/${uuidv7()}`).send({ blocked: true }).expect(404)
    }, 60_000)

    it('returns 200 with blocked_hostname_count, soft_deleted_relation_count, penalized_user_count', async () => {
      const hostnameId = await insertTestUrlHostname({ hostname: randomHostname() })
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/hostnames/${hostnameId}`)
        .send({ blocked: true })
        .expect(200)

      expect(typeof response.body.blocked_hostname_count).toBe('number')
      expect(typeof response.body.soft_deleted_relation_count).toBe('number')
      expect(typeof response.body.penalized_user_count).toBe('number')
      expect(response.body.blocked_hostname_count).toBeGreaterThanOrEqual(1)
    }, 60_000)

    it('soft-deletes post->related->url entity relations for the blocked hostname', async () => {
      const hostname = randomHostname()
      const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false })
      const creator = (await createTestUserDirect({
        username: `api-bh-creator-${rand()}`,
      })) as PrivateUser
      const postId = await insertTestPost({
        title: `API Block Test ${rand()}`,
        slug: `api-bh-${rand()}`,
        createdById: creator.id,
        markdown: 'test',
      })
      const urlObj = await addUrl(creator.id, `https://${hostname}/page`, {
        skipCreatedEvents: true,
      })
      expect(urlObj).toBeDefined()
      await relatePostToUrl(creator, postId, urlObj!.id)

      expect(await getTestRelationDeletedAt(postId, urlObj!.id)).toBeNull()

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/hostnames/${hostnameId}`)
        .send({ blocked: true })
        .expect(200)

      expect(response.body.soft_deleted_relation_count).toBeGreaterThanOrEqual(1)
      expect(await getTestRelationDeletedAt(postId, urlObj!.id)).toBeInstanceOf(Date)
    }, 60_000)

    it('applies 20% vote weight penalty to users who created relations', async () => {
      const hostname = randomHostname()
      const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false })
      const creator = (await createTestUserDirect({
        username: `api-bh-pen-${rand()}`,
      })) as PrivateUser
      const postId = await insertTestPost({
        title: `API Penalty Test ${rand()}`,
        slug: `api-pen-${rand()}`,
        createdById: creator.id,
        markdown: 'test',
      })
      const urlObj = await addUrl(creator.id, `https://${hostname}/penalize`, {
        skipCreatedEvents: true,
      })
      await relatePostToUrl(creator, postId, urlObj!.id)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/hostnames/${hostnameId}`)
        .send({ blocked: true })
        .expect(200)

      expect(response.body.penalized_user_count).toBe(1)

      const penalties = await getTestPenaltiesByHostnameId(hostnameId)
      expect(penalties).toHaveLength(1)
      expect(penalties[0]!.user_id).toBe(creator.id)
      expect(penalties[0]!.reason).toBe('blocked_hostname')
      expect(penalties[0]!.revoked_at).toBeNull()
    }, 60_000)

    it('is idempotent: re-blocking does not duplicate penalties', async () => {
      const hostname = randomHostname()
      const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false })
      const creator = (await createTestUserDirect({
        username: `api-bh-idem-${rand()}`,
      })) as PrivateUser
      const postId = await insertTestPost({
        title: `API Idempotent Test ${rand()}`,
        slug: `api-idem-${rand()}`,
        createdById: creator.id,
        markdown: 'test',
      })
      const urlObj = await addUrl(creator.id, `https://${hostname}/idempotent`, {
        skipCreatedEvents: true,
      })
      await relatePostToUrl(creator, postId, urlObj!.id)

      const request = createRequest()
      await request.authenticateAs(admin)
      await request.patch(`/api/v1/hostnames/${hostnameId}`).send({ blocked: true }).expect(200)
      const response2 = await request
        .patch(`/api/v1/hostnames/${hostnameId}`)
        .send({ blocked: true })
        .expect(200)

      expect(response2.body.penalized_user_count).toBe(0)

      const penalties = await getTestPenaltiesByHostnameId(hostnameId)
      const userPenalties = penalties.filter(p => p.user_id === creator.id)
      expect(userPenalties).toHaveLength(1)
    }, 60_000)

    it('unblocking with blocked=false updates hostname without the blocking flow', async () => {
      const hostnameId = await insertTestUrlHostname({
        hostname: randomHostname(),
        blocked: true,
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.patch(`/api/v1/hostnames/${hostnameId}`).send({ blocked: false }).expect(204)
    }, 60_000)
  })
})
