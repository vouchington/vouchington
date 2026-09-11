import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestDomainBlacklist,
  createTestBlacklistSource,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { addDomainsToBloomFilter } from '@services/urls-domains-blacklist/bloom-filter'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const RANDOM_ID = Array.from({ length: 8 }, () => LETTERS[Math.floor(Math.random() * 26)]).join('')
const TEST_API_BLOCKED_DOMAIN = `api-profile-blacklist-test-${RANDOM_ID}.com`
const TEST_API_SOURCE_NAME = `test-api-profile-blacklist-${RANDOM_ID}`

describe('GET /api/v1/my/profile', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/profile').expect(401)
  })

  it('returns profile data for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/profile').expect(200)
    expect(response.body.profile.id).toBe(user.id)
    expect(typeof response.body.profile.markdown).toBe('string')
  })
})

describe('PATCH /api/v1/my/profile', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.patch('/api/v1/my/profile').send({ markdown: 'hello' }).expect(401)
  })

  it('updates profile markdown', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const markdown = '# Hello world\n\nThis is my profile.'
    const response = await request.patch('/api/v1/my/profile').send({ markdown }).expect(200)

    expect(response.body.profile.markdown).toBe(markdown)
  })

  it('returns 400 when markdown missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.patch('/api/v1/my/profile').send({}).expect(400)
  })
})

describe('Profile links CRUD', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('GET /api/v1/my/profile/links returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/profile/links').expect(401)
  })

  it('GET /api/v1/my/profile/links returns empty list initially', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/profile/links').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body).not.toHaveProperty('page_info')
  })

  it('POST /api/v1/my/profile/links creates a URL link', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/profile/links')
      .send({ link_type: 'url', url: 'https://example.com', name: 'My Website' })
      .expect(201)

    expect(response.body.profile_link.link_type).toBe('url')
    expect(response.body.profile_link.url).toBe('https://example.com')
    expect(response.body.profile_link.name).toBe('My Website')
  })

  it('POST /api/v1/my/profile/links creates a social handle link', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/profile/links')
      .send({ link_type: 'github', handle: 'octocat' })
      .expect(201)

    expect(response.body.profile_link.link_type).toBe('github')
    expect(response.body.profile_link.handle).toBe('octocat')
  })

  it('POST /api/v1/my/profile/links returns 400 for invalid link_type', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/profile/links')
      .send({ link_type: 'invalid', url: 'https://example.com' })
      .expect(400)
  })

  it('PATCH /api/v1/my/profile/links/:id updates a link', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    // Create a link first
    const createResponse = await request
      .post('/api/v1/my/profile/links')
      .send({ link_type: 'url', url: 'https://before.com', name: 'Before' })
      .expect(201)

    const linkId = createResponse.body.profile_link.id

    const updateResponse = await request
      .patch(`/api/v1/my/profile/links/${linkId}`)
      .send({ url: 'https://after.com', name: 'After' })
      .expect(200)

    expect(updateResponse.body.profile_link.url).toBe('https://after.com')
    expect(updateResponse.body.profile_link.name).toBe('After')
  })

  it('PATCH /api/v1/my/profile/links/:id returns 404 for unknown link', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .patch('/api/v1/my/profile/links/00000000-0000-7000-0000-000000000000')
      .send({ url: 'https://example.com' })
      .expect(404)
  })

  it('DELETE /api/v1/my/profile/links/:id removes a link', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const createResponse = await request
      .post('/api/v1/my/profile/links')
      .send({ link_type: 'twitter', handle: 'testuser' })
      .expect(201)

    const linkId = createResponse.body.profile_link.id
    await request.delete(`/api/v1/my/profile/links/${linkId}`).expect(204)

    const listResponse = await request.get('/api/v1/my/profile/links').expect(200)
    const found = listResponse.body.results.find((l: { id: string }) => l.id === linkId)
    expect(found).toBeUndefined()
  })

  it('PUT /api/v1/my/profile/links/order reorders links', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    // Create two new links
    const link1 = await request
      .post('/api/v1/my/profile/links')
      .send({ link_type: 'github', handle: 'user1' })
      .expect(201)
    const link2 = await request
      .post('/api/v1/my/profile/links')
      .send({ link_type: 'twitter', handle: 'user2' })
      .expect(201)

    const id1 = link1.body.profile_link.id
    const id2 = link2.body.profile_link.id

    // Get all existing links to build complete ordered list (reorder requires full set)
    const existingResponse = await request.get('/api/v1/my/profile/links').expect(200)
    const otherIds = existingResponse.body.results.flatMap((l: { id: string }) =>
      l.id !== id1 && l.id !== id2 ? [l.id] : [],
    )

    // Reorder: put link2 first, link1 second, then the rest
    const reordered = await request
      .put('/api/v1/my/profile/links/order')
      .send({ ids: [id2, id1, ...otherIds] })
      .expect(200)

    expect(Array.isArray(reordered.body.results)).toBe(true)
    expect(reordered.body).not.toHaveProperty('page_info')
    const reorderedIds = reordered.body.results.map((l: { id: string }) => l.id)
    expect(reorderedIds.indexOf(id2)).toBeLessThan(reorderedIds.indexOf(id1))

    const listResponse = await request.get('/api/v1/my/profile/links').expect(200)
    const ids = listResponse.body.results.map((l: { id: string }) => l.id)
    // id2 should appear before id1
    expect(ids.indexOf(id2)).toBeLessThan(ids.indexOf(id1))
  })
})

describe('Domain blacklist enforcement', () => {
  let user: PrivateUser

  beforeAll(async () => {
    await createTestBlacklistSource({
      type: 'url',
      name: TEST_API_SOURCE_NAME,
      url: 'https://example.com/blacklist.txt',
    })
    await insertTestDomainBlacklist(TEST_API_BLOCKED_DOMAIN, TEST_API_SOURCE_NAME)
    await addDomainsToBloomFilter([TEST_API_BLOCKED_DOMAIN])
    user = await createTestUser()
  }, 30_000)

  it('PATCH /api/v1/my/profile returns 400 when markdown contains blocked domain', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const markdown = `Visit [bad site](https://${TEST_API_BLOCKED_DOMAIN}/page) for info.`
    await request.patch('/api/v1/my/profile').send({ markdown }).expect(400)
  })

  it('POST /api/v1/my/profile/links returns 400 when URL has blocked domain', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/my/profile/links')
      .send({ link_type: 'url', url: `https://${TEST_API_BLOCKED_DOMAIN}/page` })
      .expect(400)
  })
})
