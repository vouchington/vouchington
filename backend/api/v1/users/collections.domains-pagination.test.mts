import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertEntityRelation,
  insertTestUrlHostname,
  safeUsername,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'

describe('GET /api/v1/users/:idOrSlug/domains/:listType pagination', () => {
  it('returns an empty page when the user has no blocked domains', async () => {
    const owner = await createTestUser({ username: safeUsername('domains-page-empty') })
    if (!owner) throw new Error('Failed to create owner')

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request.get(`/api/v1/users/${owner.id}/domains/blocked`).expect(200)
    expect(response.body).toMatchObject({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  it('paginates blocked domains at the exact limit across pages without duplicates', async () => {
    const owner = await createTestUser({ username: safeUsername('domains-page-exact') })
    if (!owner) throw new Error('Failed to create owner')

    const hostnameIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const hostnameId = await insertTestUrlHostname({
        hostname: `domains-page-exact-${index}-${owner.id}.example.com`,
      })
      hostnameIds.push(hostnameId)
      await insertEntityRelation('relation__user__block__url_hostname', owner.id, hostnameId)
      await updateTestEntityRelationCreatedAt(
        'relation__user__block__url_hostname',
        owner.id,
        hostnameId,
        new Date(Date.now() - index * 10_000),
      )
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request.get(`/api/v1/users/${owner.id}/domains/blocked?limit=2`).expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/domains/blocked?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const resultIds = [...page1.body.results, ...page2.body.results].map(
      (hostname: { id: string }) => hostname.id,
    )
    expect(resultIds).toEqual(hostnameIds)
    expect(new Set(resultIds).size).toBe(3)
  })

  it('breaks ties deterministically when two blocked domains share a created_at timestamp', async () => {
    const owner = await createTestUser({ username: safeUsername('domains-page-tie') })
    if (!owner) throw new Error('Failed to create owner')

    const tieDate = new Date(Date.now() - 60_000)
    const hostnameA = await insertTestUrlHostname({
      hostname: `domains-page-tie-a-${owner.id}.example.com`,
    })
    const hostnameB = await insertTestUrlHostname({
      hostname: `domains-page-tie-b-${owner.id}.example.com`,
    })
    await insertEntityRelation('relation__user__block__url_hostname', owner.id, hostnameA)
    await insertEntityRelation('relation__user__block__url_hostname', owner.id, hostnameB)
    await updateTestEntityRelationCreatedAt(
      'relation__user__block__url_hostname',
      owner.id,
      hostnameA,
      tieDate,
    )
    await updateTestEntityRelationCreatedAt(
      'relation__user__block__url_hostname',
      owner.id,
      hostnameB,
      tieDate,
    )
    const expectedOrder = [hostnameA, hostnameB].sort().reverse()

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request.get(`/api/v1/users/${owner.id}/domains/blocked?limit=1`).expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/domains/blocked?limit=1&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect([page1.body.results[0].id, page2.body.results[0].id]).toEqual(expectedOrder)
  })

  it('rejects a malformed cursor', async () => {
    const owner = await createTestUser({ username: safeUsername('domains-page-bad-cursor') })
    if (!owner) throw new Error('Failed to create owner')

    const request = createRequest()
    await request.authenticateAs(owner)
    await request.get(`/api/v1/users/${owner.id}/domains/blocked?after=invalid`).expect(400)
  })

  it('rejects a cursor scoped to another user', async () => {
    const owner = await createTestUser({ username: safeUsername('domains-page-scope-a') })
    const other = await createTestUser({ username: safeUsername('domains-page-scope-b') })
    if (!owner || !other) throw new Error('Failed to create users')

    for (let index = 0; index < 2; index++) {
      const hostnameId = await insertTestUrlHostname({
        hostname: `domains-page-scope-other-${index}-${other.id}.example.com`,
      })
      await insertEntityRelation('relation__user__block__url_hostname', other.id, hostnameId)
    }

    const otherRequest = createRequest()
    await otherRequest.authenticateAs(other)
    const otherPage = await otherRequest
      .get(`/api/v1/users/${other.id}/domains/blocked?limit=1`)
      .expect(200)
    expect(otherPage.body.page_info.end_cursor).not.toBeNull()

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest
      .get(
        `/api/v1/users/${owner.id}/domains/blocked?limit=1&after=${encodeURIComponent(otherPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('rejects a cursor scoped to the muted-domains list type', async () => {
    const owner = await createTestUser({ username: safeUsername('domains-page-scope-listtype') })
    if (!owner) throw new Error('Failed to create owner')

    for (let index = 0; index < 2; index++) {
      const hostnameId = await insertTestUrlHostname({
        hostname: `domains-page-scope-blocked-${index}-${owner.id}.example.com`,
      })
      await insertEntityRelation('relation__user__block__url_hostname', owner.id, hostnameId)
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const blockedPage = await request
      .get(`/api/v1/users/${owner.id}/domains/blocked?limit=1`)
      .expect(200)
    expect(blockedPage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/domains/muted?limit=1&after=${encodeURIComponent(blockedPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })
})
