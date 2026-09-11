import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertEntityRelation,
  safeUsername,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import type { ViewUrl } from '@services/urls/types'

async function saveTestUrl(ownerId: string, suffix: string): Promise<ViewUrl> {
  const url = await addUrl(null, `https://example.com/${suffix}`, { content_type: 'text/html' })
  if (!url) throw new Error('Failed to create profile collection URL')
  await insertEntityRelation('relation__user__save__url', ownerId, url.id)
  return url
}

describe('GET /api/v1/users/:idOrSlug/urls/:listType pagination', () => {
  it('returns an empty page when the user has no saved urls', async () => {
    const owner = await createTestUser({ username: safeUsername('urls-page-empty') })
    if (!owner) throw new Error('Failed to create owner')

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request.get(`/api/v1/users/${owner.id}/urls/saved`).expect(200)
    expect(response.body).toMatchObject({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  it('paginates saved urls at the exact limit across pages without duplicates', async () => {
    const owner = await createTestUser({ username: safeUsername('urls-page-exact') })
    if (!owner) throw new Error('Failed to create owner')

    const urlIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const url = await saveTestUrl(owner.id, `urls-page-exact-${owner.id}-${index}`)
      urlIds.push(url.id)
      await updateTestEntityRelationCreatedAt(
        'relation__user__save__url',
        owner.id,
        url.id,
        new Date(Date.now() - index * 10_000),
      )
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request.get(`/api/v1/users/${owner.id}/urls/saved?limit=2`).expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/urls/saved?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const resultIds = [...page1.body.results, ...page2.body.results].map(
      (url: { id: string }) => url.id,
    )
    expect(resultIds).toEqual(urlIds)
    expect(new Set(resultIds).size).toBe(3)
  })

  it('breaks ties deterministically when two saved urls share a created_at timestamp', async () => {
    const owner = await createTestUser({ username: safeUsername('urls-page-tie') })
    if (!owner) throw new Error('Failed to create owner')

    const tieDate = new Date(Date.now() - 60_000)
    const urlA = await saveTestUrl(owner.id, `urls-page-tie-a-${owner.id}`)
    const urlB = await saveTestUrl(owner.id, `urls-page-tie-b-${owner.id}`)
    await updateTestEntityRelationCreatedAt('relation__user__save__url', owner.id, urlA.id, tieDate)
    await updateTestEntityRelationCreatedAt('relation__user__save__url', owner.id, urlB.id, tieDate)
    const expectedOrder = [urlA.id, urlB.id].sort().reverse()

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request.get(`/api/v1/users/${owner.id}/urls/saved?limit=1`).expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/urls/saved?limit=1&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(1)
    expect(page2.body.results).toHaveLength(1)
    expect([page1.body.results[0].id, page2.body.results[0].id]).toEqual(expectedOrder)
  })

  it('rejects a malformed cursor', async () => {
    const owner = await createTestUser({ username: safeUsername('urls-page-bad-cursor') })
    if (!owner) throw new Error('Failed to create owner')

    const request = createRequest()
    await request.authenticateAs(owner)
    await request.get(`/api/v1/users/${owner.id}/urls/saved?after=invalid`).expect(400)
  })

  it('rejects a cursor scoped to another user', async () => {
    const owner = await createTestUser({ username: safeUsername('urls-page-scope-a') })
    const other = await createTestUser({ username: safeUsername('urls-page-scope-b') })
    if (!owner || !other) throw new Error('Failed to create users')

    await saveTestUrl(other.id, `urls-page-scope-other-a-${other.id}`)
    await saveTestUrl(other.id, `urls-page-scope-other-b-${other.id}`)

    const otherRequest = createRequest()
    await otherRequest.authenticateAs(other)
    const otherPage = await otherRequest
      .get(`/api/v1/users/${other.id}/urls/saved?limit=1`)
      .expect(200)
    expect(otherPage.body.page_info.end_cursor).not.toBeNull()

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest
      .get(
        `/api/v1/users/${owner.id}/urls/saved?limit=1&after=${encodeURIComponent(otherPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('rejects a cursor scoped to the blocked-domains endpoint', async () => {
    const owner = await createTestUser({ username: safeUsername('urls-page-scope-domain') })
    if (!owner) throw new Error('Failed to create owner')

    await saveTestUrl(owner.id, `urls-page-scope-domain-a-${owner.id}`)
    await saveTestUrl(owner.id, `urls-page-scope-domain-b-${owner.id}`)

    const request = createRequest()
    await request.authenticateAs(owner)
    const urlPage = await request.get(`/api/v1/users/${owner.id}/urls/saved?limit=1`).expect(200)
    expect(urlPage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/domains/blocked?limit=1&after=${encodeURIComponent(urlPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })
})
