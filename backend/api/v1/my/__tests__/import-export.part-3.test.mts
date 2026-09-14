import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/export/rss-feeds?format=csv', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/export/rss-feeds?format=csv').expect(401)
  })

  it('returns CSV with header row', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/export/rss-feeds?format=csv').expect(200)

    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.text).toContain('title,url,feed_type,home_page_url,topic')
  })

  it('sets Content-Disposition attachment header', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/export/rss-feeds?format=csv').expect(200)

    expect(response.headers['content-disposition']).toContain('attachment')
    expect(response.headers['content-disposition']).toContain('rss-feeds.csv')
  })
})

describe('POST /api/v1/my/import/rss-feeds — CSV via JSON body', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('extracts URL from csv field with header-only column', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({ csv: 'url\nhttps://example.com/feed.xml' })
      .expect(201)

    expect(response.body.import).toBeDefined()
    expect(response.body.import.id).toBeDefined()
  })

  it('extracts URL from csv field with multiple columns', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({ csv: 'url,title\nhttps://a.com/rss,Feed A' })
      .expect(201)

    expect(response.body.import).toBeDefined()
  })

  it('extracts URL from csv field with xmlUrl column', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({ csv: 'xmlUrl,title\nhttps://b.com/feed,My Feed' })
      .expect(201)

    expect(response.body.import).toBeDefined()
  })

  it('falls back to line-list when csv has no recognized URL column', async () => {
    // parseCsvImport falls back to parseTsvOrUrlList when no url/xmlUrl/rss_feed_url column
    // is found; lines are treated as raw URL strings (validation happens at fetch time)
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({ csv: 'name,description\nFoo,Bar' })
      .expect(201)
  })

  it('returns 400 for malformed CSV in json body', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({ csv: 'url\nhttps://ok.com/rss,"unclosed' })
      .expect(400)
  })

  it('accepts a newline-separated URL list in the csv field', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({ csv: 'https://example.com/feed.xml\nhttps://other.com/rss' })
      .expect(201)

    expect(response.body.import).toBeDefined()
  })

  it('rejects a non-JSON (text/csv) body with 415', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'text/csv')
      .send('url\nhttps://example.com/rss')
      .expect(415)
  })

  it('extracts feed URLs from an opml field', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({
        opml: '<opml version="2.0"><body><outline type="rss" xmlUrl="https://example.com/feed.xml"/></body></opml>',
      })
      .expect(201)

    expect(response.body.import).toBeDefined()
  })

  it('accepts a urls array, ignoring non-string and blank entries', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({ urls: ['https://example.com/rss', 123, '   ', ''], follow: true })
      .expect(201)

    expect(response.body.import).toBeDefined()
  })

  it('returns 400 when no opml, csv, or urls field is present', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/import/rss-feeds')
      .set('Content-Type', 'application/json')
      .send({ follow: true })
      .expect(400)
  })
})
