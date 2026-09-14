import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('batch-topics.routes', () => {
  const randomSuffix = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  function makeTopicCsv(rows: Record<string, string>[], headers?: string[]): string {
    const cols = headers ?? Object.keys(rows[0] ?? { slug: '' })
    const headerLine = cols.join(',')
    const dataLines = rows.map(row => cols.map(c => row[c] ?? '').join(','))
    return `${[headerLine, ...dataLines].join('\n')}\n`
  }

  describe('POST /api/v1/imports/topics', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/imports/topics')
        .send({ csv: 'slug,name\nmy-topic,My Topic\n' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post('/api/v1/imports/topics')
        .send({ csv: 'slug,name\nmy-topic,My Topic\n' })
        .expect(403)
    })

    it('returns 400 for empty CSV body', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/imports/topics').send({ csv: '' }).expect(400)
    })

    it('returns 400 for header-only CSV (no data rows)', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/imports/topics').send({ csv: 'slug,name\n' }).expect(400)
    })

    it('returns 400 for malformed CSV', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/imports/topics')
        .send({ csv: 'slug,name\nval1,val2,extra-col\n' })
        .expect(400)
    })

    it('returns 422 for CSV with unknown columns', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const suffix = randomSuffix()
      const csv = `slug,name,unknown_field\n${suffix}-topic,My Topic,bad\n`
      const response = await request.post('/api/v1/imports/topics').send({ csv }).expect(422)
      expect(response.body.valid).toBe(false)
      expect(response.body.error).toMatch(/unknown_field/)
    })

    it('returns 422 for invalid rows (bad slug)', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = `slug,name\nInvalid Slug!,Some Name\n`
      const response = await request.post('/api/v1/imports/topics').send({ csv }).expect(422)
      expect(response.body.valid).toBe(false)
      expect(response.body.validation).toHaveProperty('rows')
    })

    it('returns 422 for rss_feed_url without rss_feed_title', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const suffix = randomSuffix()
      const csv = `slug,name,rss_feed_url,rss_feed_title\nrss-topic-${suffix},RSS Topic,https://example.com/feed.xml,\n`
      const response = await request.post('/api/v1/imports/topics').send({ csv }).expect(422)
      expect(response.body.valid).toBe(false)
    })

    it('returns 201 and batch info for valid CSV', async () => {
      const suffix = randomSuffix()
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = makeTopicCsv(
        [{ slug: `route-test-${suffix}`, name: `Route Test ${suffix}` }],
        ['slug', 'name'],
      )
      const response = await request.post('/api/v1/imports/topics').send({ csv }).expect(201)
      expect(response.body.valid).toBe(true)
      expect(response.body.batch).toHaveProperty('id')
      expect(response.body.batch.import_type).toBe('topic')
      expect(response.body.batch.total_rows).toBe(1)
    })

    it('returns 201 for valid CSV with topic + RSS feed columns', async () => {
      const suffix = randomSuffix()
      const parentSlug = `rss-parent-${suffix}`
      await insertTestTopic({
        name: `RSS Parent ${suffix}`,
        slug: parentSlug,
        createdById: admin.id,
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = makeTopicCsv([
        {
          slug: `rss-route-test-${suffix}`,
          name: `RSS Route Test ${suffix}`,
          topic_type: 'rss_feed',
          parent_slugs: parentSlug,
          rss_feed_url: `https://rss-route-${suffix}.example.com/feed.xml`,
          rss_feed_title: `Feed Route ${suffix}`,
        },
      ])
      const response = await request.post('/api/v1/imports/topics').send({ csv }).expect(201)
      expect(response.body.valid).toBe(true)
      expect(response.body.batch.total_rows).toBe(1)
    })

    it('supports upsert: importing same slug twice updates existing topic', async () => {
      const suffix = randomSuffix()
      const slug = `upsert-route-${suffix}`
      await insertTestTopic({ name: `Original ${suffix}`, slug, createdById: admin.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = makeTopicCsv([{ slug, name: `Updated ${suffix}` }], ['slug', 'name'])
      const response = await request.post('/api/v1/imports/topics').send({ csv }).expect(201)
      expect(response.body.valid).toBe(true)
      expect(response.body.batch.total_rows).toBe(1)
    })

    it('handles multiple rows in one import', async () => {
      const suffix = randomSuffix()
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = makeTopicCsv(
        [
          { slug: `multi-a-${suffix}`, name: `Multi A ${suffix}` },
          { slug: `multi-b-${suffix}`, name: `Multi B ${suffix}` },
          { slug: `multi-c-${suffix}`, name: `Multi C ${suffix}` },
        ],
        ['slug', 'name'],
      )
      const response = await request.post('/api/v1/imports/topics').send({ csv }).expect(201)
      expect(response.body.batch.total_rows).toBe(3)
    })
  })

  describe('GET /api/v1/imports/:batchId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/imports/00000000-0000-0000-0000-000000000001').expect(401)
    })

    it('returns 404 for batches outside the current user scope', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/imports/00000000-0000-0000-0000-000000000001').expect(404)
    })

    it('returns 400 for invalid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/imports/not-a-uuid').expect(400)
    })

    it('returns 404 for non-existent batch', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/imports/00000000-0000-0000-0000-000000000001').expect(404)
    })

    it('returns batch data, rows, and progress for existing batch', async () => {
      const suffix = randomSuffix()
      const adminRequest = createRequest()
      await adminRequest.authenticateAs(admin)

      const createResponse = await adminRequest
        .post('/api/v1/imports/topics')
        .send({ csv: `slug,name\nbatch-status-${suffix},Batch Status ${suffix}\n` })
        .expect(201)

      const batchId = createResponse.body.batch.id as string

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/imports/${batchId}`).expect(200)

      expect(response.body.batch).toHaveProperty('id', batchId)
      expect(response.body.batch.import_type).toBe('topic')
      expect(Array.isArray(response.body.rows)).toBe(true)
      expect(response.body.rows).toHaveLength(1)
      expect(response.body.progress).toHaveProperty('total')
    })
  })
})
