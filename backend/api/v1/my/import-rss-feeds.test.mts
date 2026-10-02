import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  countRssFeedImportBatchesForTest,
  createTestUser,
  readTestContentProvenance,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const UUID = '00000000-0000-7000-8000-000000000001'
const feedUrl = () => `https://feeds.example/${Math.random().toString(36).slice(2, 10)}.xml`

describe('RSS feed import status and line-list parsing', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    await createRequest().get(`/api/v1/my/import/rss-feeds/${UUID}`).expect(401)
  })

  it('serves the status of the caller import and hides it from others', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const created = await request
      .post('/api/v1/my/import/rss-feeds')
      .send({ urls: [feedUrl()] })
      .expect(201)
    const statusUrl = created.body.status_url as string
    expect(created.headers.location).toBe(statusUrl)

    const status = await request.get(statusUrl).expect(200)
    expect(status.body.import.id).toBe(created.body.import.id)

    const stranger = createRequest()
    await stranger.authenticateAs(await createTestUser())
    await stranger.get(statusUrl).expect(404)
  })

  it('rejects a malformed import id and reports an unknown one', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/my/import/rss-feeds/not-a-uuid').expect(400)
    await request.get(`/api/v1/my/import/rss-feeds/${UUID}`).expect(404)
  })

  it('reads the url column of a tab-separated list, skipping short rows', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/import/rss-feeds')
      .send({ csv: `title\turl\nno url column here\nFeed\t${feedUrl()}\n\n` })
      .expect(201)
  })

  it.each([
    ['a tab-separated list without a url column', 'title\tnotes\nFeed\tNotes'],
    ['a tab-separated list with only empty urls', 'title\turl\nFeed\t'],
    ['blank lines', ' \n\t\n'],
  ])('returns 400 for %s', async (_label, csv) => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/my/import/rss-feeds').send({ csv }).expect(400)
  })

  it('returns 400 when a list exceeds the row cap', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const urls = Array.from({ length: 501 }, feedUrl)
    await request.post('/api/v1/my/import/rss-feeds').send({ urls }).expect(400)
  })
})

describe('RSS feed import provenance', () => {
  async function signedInAs(clientHeaders: Record<string, string>) {
    const importer = await createTestUser()
    const request = createRequest()
    request.setClientInfo(clientHeaders)
    await request.authenticateAs(importer)
    return { importer, request }
  }

  it.each([
    ['web', {}],
    ['swift', { 'x-voucha-client': 'swift', 'x-voucha-platform': 'ios' }],
  ])('stores the %s client that submitted the import on its batch', async (client, headers) => {
    const { request } = await signedInAs(headers)

    const created = await request
      .post('/api/v1/my/import/rss-feeds')
      .send({ urls: [feedUrl()] })
      .expect(201)

    await expect(
      readTestContentProvenance('user_rss_feed_import_batches', created.body.import.id),
    ).resolves.toEqual({ createdVia: client, oauthClientId: null })
    expect(JSON.stringify(created.body)).not.toContain('created_via')
    const status = await request.get(created.body.status_url).expect(200)
    expect(JSON.stringify(status.body)).not.toContain('created_via')
  })

  it('rejects a submission whose client information is invalid and stores nothing', async () => {
    const { importer, request } = await signedInAs({ 'x-voucha-client': 'unclassified-client' })

    const response = await request
      .post('/api/v1/my/import/rss-feeds')
      .send({ urls: [feedUrl()] })
      .expect(400)

    expect(response.body.code).toBe('INVALID_CLIENT_INFO')
    await expect(countRssFeedImportBatchesForTest(importer.id)).resolves.toBe(0)
  })
})
