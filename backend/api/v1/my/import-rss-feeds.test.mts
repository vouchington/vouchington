import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB } from '@queues/background/enqueues/imports-jobs'
import { background } from '@queues/background/queues'
import { userImportExportConfig } from '@services/user-import-export/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
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

  it('pages the rows of an import by cursor, never listing more than the configured page', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_status_page_size: 2 }),
    )
    const request = createRequest()
    await request.authenticateAs(user)
    const urls = [feedUrl(), feedUrl(), feedUrl()]
    const created = await request.post('/api/v1/my/import/rss-feeds').send({ urls }).expect(201)
    const statusUrl = created.body.status_url as string

    const first = await request.get(`${statusUrl}?limit=1000`).expect(200)
    expect(first.body.import).toMatchObject({ total_rows: 3, pending_rows: 3 })
    expect(first.body.rows.map((row: { input: string }) => row.input)).toEqual(urls.slice(0, 2))
    expect(first.body.page_info.has_next_page).toBe(true)

    const second = await request
      .get(`${statusUrl}?after=${encodeURIComponent(first.body.page_info.end_cursor)}`)
      .expect(200)
    expect(second.body.rows.map((row: { input: string }) => row.input)).toEqual(urls.slice(2))
    expect(second.body.page_info.has_next_page).toBe(false)

    await request.get(`${statusUrl}?limit=0`).expect(400)
    await request.get(`${statusUrl}?after=not-a-cursor`).expect(400)
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

  it('bounds a URL list at 500 items of 2083 characters and starts one dispatcher', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const prefix = 'https://bounds.example/feed.xml?'
    const acceptedUrl = prefix + 'a'.repeat(2083 - prefix.length)
    const urls = Array.from({ length: 500 }, (_, index) => (index === 0 ? acceptedUrl : feedUrl()))

    const created = await request.post('/api/v1/my/import/rss-feeds').send({ urls }).expect(201)

    expect(created.body.import).toMatchObject({ total_rows: 500, pending_rows: 500 })
    const dispatchers = await background.searchJobs({
      name: IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name,
      data: { importId: created.body.import.id },
    })
    expect(dispatchers).toHaveLength(1)

    await request
      .post('/api/v1/my/import/rss-feeds')
      .send({ urls: [...urls, feedUrl()] })
      .expect(422)
    await request
      .post('/api/v1/my/import/rss-feeds')
      .send({ urls: [`${acceptedUrl}a`] })
      .expect(422)
  })

  it('reads the body limit from config on every request', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { import_max_body_bytes: 1_024 }),
    )
    const request = createRequest()
    await request.authenticateAs(user)
    const urls = Array.from({ length: 100 }, feedUrl)

    await request.post('/api/v1/my/import/rss-feeds').send({ urls }).expect(413)
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
