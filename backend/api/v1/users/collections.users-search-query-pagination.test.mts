import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  safeUsername,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { followUser } from '@voucha/test-helpers/entities/test-entities'

const FOLLOW_USER_TABLE = 'relation__user__follow__user'

describe('GET /api/v1/users/:idOrSlug/users/:listType q search-filter pagination', () => {
  it('filters followers by username prefix', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-prefix-owner') })
    const matching = await createTestUser({ username: safeUsername('users-q-prefix-match') })
    const nonMatching = await createTestUser({ username: safeUsername('users-q-prefix-other') })
    if (!owner || !matching || !nonMatching) throw new Error('Failed to create users')

    await followUser(matching, owner)
    await followUser(nonMatching, owner)

    // safeUsername appends a `-<12 random chars>` suffix; strip it to get a deterministic prefix.
    const prefix = matching.username!.slice(0, matching.username!.length - 13)
    const page = await createRequest()
      .get(`/api/v1/users/${owner.id}/users/followers?q=${encodeURIComponent(prefix)}`)
      .expect(200)

    expect(page.body.results.map((user: { id: string }) => user.id)).toEqual([matching.id])
  })

  it('filters following by username prefix', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-following-owner') })
    const matching = await createTestUser({ username: safeUsername('users-q-following-match') })
    const nonMatching = await createTestUser({ username: safeUsername('users-q-following-other') })
    if (!owner || !matching || !nonMatching) throw new Error('Failed to create users')

    await followUser(owner, matching)
    await followUser(owner, nonMatching)

    const prefix = matching.username!.slice(0, matching.username!.length - 13)
    const page = await createRequest()
      .get(`/api/v1/users/${owner.id}/users/following?q=${encodeURIComponent(prefix)}`)
      .expect(200)

    expect(page.body.results.map((user: { id: string }) => user.id)).toEqual([matching.id])
  })

  it('matches q case-insensitively', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-case-owner') })
    const matching = await createTestUser({ username: safeUsername('users-q-case-match') })
    if (!owner || !matching) throw new Error('Failed to create users')

    await followUser(matching, owner)

    const prefix = matching.username!.slice(0, matching.username!.length - 13).toUpperCase()
    const page = await createRequest()
      .get(`/api/v1/users/${owner.id}/users/followers?q=${encodeURIComponent(prefix)}`)
      .expect(200)

    expect(page.body.results.map((user: { id: string }) => user.id)).toEqual([matching.id])
  })

  it('does not match a query that is only a substring, not a prefix, of the username', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-substr-owner') })
    const follower = await createTestUser({ username: safeUsername('users-q-substr-follower') })
    if (!owner || !follower) throw new Error('Failed to create users')

    await followUser(follower, owner)

    const page = await createRequest()
      .get(`/api/v1/users/${owner.id}/users/followers?q=substr-follower`)
      .expect(200)

    expect(page.body.results).toEqual([])
  })

  it('returns an empty page when no follower matches q', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-empty-owner') })
    const follower = await createTestUser({ username: safeUsername('users-q-empty-follower') })
    if (!owner || !follower) throw new Error('Failed to create users')

    await followUser(follower, owner)

    const page = await createRequest()
      .get(`/api/v1/users/${owner.id}/users/followers?q=zzz-no-match-zzz`)
      .expect(200)

    expect(page.body).toMatchObject({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  it('paginates q-filtered followers at the exact limit across pages without duplicates', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-exact-owner') })
    if (!owner) throw new Error('Failed to create owner')

    const followerIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const follower = await createTestUser({
        username: safeUsername(`users-q-exact-match-${index}`),
      })
      if (!follower) throw new Error('Failed to create follower')
      await followUser(follower, owner)
      await updateTestEntityRelationCreatedAt(
        FOLLOW_USER_TABLE,
        follower.id,
        owner.id,
        new Date(Date.now() - index * 10_000),
      )
      followerIds.push(follower.id)
    }
    // A follower that does not match the query must never appear in a filtered page.
    const nonMatching = await createTestUser({
      username: safeUsername('users-q-exact-nomatch'),
    })
    if (!nonMatching) throw new Error('Failed to create non-matching follower')
    await followUser(nonMatching, owner)

    const request = createRequest()
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/users/followers?limit=2&q=u-users-q-exact-match`)
      .expect(200)
    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)

    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/users/followers?limit=2&q=u-users-q-exact-match&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })

    const resultIds = [...page1.body.results, ...page2.body.results].map(
      (user: { id: string }) => user.id,
    )
    expect(resultIds).toEqual(followerIds)
    expect(new Set(resultIds).size).toBe(3)
  })

  it('breaks ties deterministically when two q-filtered followers share a created_at timestamp', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-tie-owner') })
    const followerA = await createTestUser({ username: safeUsername('users-q-tie-match-a') })
    const followerB = await createTestUser({ username: safeUsername('users-q-tie-match-b') })
    if (!owner || !followerA || !followerB) throw new Error('Failed to create users')

    await followUser(followerA, owner)
    await followUser(followerB, owner)
    const tieDate = new Date(Date.now() - 60_000)
    await updateTestEntityRelationCreatedAt(FOLLOW_USER_TABLE, followerA.id, owner.id, tieDate)
    await updateTestEntityRelationCreatedAt(FOLLOW_USER_TABLE, followerB.id, owner.id, tieDate)
    const expectedOrder = [followerA.id, followerB.id].sort().reverse()

    const request = createRequest()
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/users/followers?limit=1&q=u-users-q-tie-match`)
      .expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/users/followers?limit=1&q=u-users-q-tie-match&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(1)
    expect(page2.body.results).toHaveLength(1)
    expect([page1.body.results[0].id, page2.body.results[0].id]).toEqual(expectedOrder)
  })

  it('rejects a malformed cursor when q is present', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-bad-cursor') })
    if (!owner) throw new Error('Failed to create owner')

    await createRequest()
      .get(`/api/v1/users/${owner.id}/users/followers?q=anything&after=invalid`)
      .expect(400)
  })

  it('rejects a q-filtered cursor replayed under a different q', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-scope-owner') })
    const followerA = await createTestUser({ username: safeUsername('users-q-scope-match-a') })
    const followerB = await createTestUser({ username: safeUsername('users-q-scope-match-b') })
    if (!owner || !followerA || !followerB) throw new Error('Failed to create users')

    await followUser(followerA, owner)
    await followUser(followerB, owner)

    const request = createRequest()
    const filteredPage = await request
      .get(`/api/v1/users/${owner.id}/users/followers?limit=1&q=u-users-q-scope-match`)
      .expect(200)
    expect(filteredPage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/users/followers?limit=1&q=u-users-q-scope-match-b&after=${encodeURIComponent(filteredPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('rejects a q-filtered cursor replayed with q omitted', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-scope-drop-owner') })
    const followerA = await createTestUser({
      username: safeUsername('users-q-scope-drop-match-a'),
    })
    const followerB = await createTestUser({
      username: safeUsername('users-q-scope-drop-match-b'),
    })
    if (!owner || !followerA || !followerB) throw new Error('Failed to create users')

    await followUser(followerA, owner)
    await followUser(followerB, owner)

    const request = createRequest()
    const filteredPage = await request
      .get(`/api/v1/users/${owner.id}/users/followers?limit=1&q=u-users-q-scope-drop-match`)
      .expect(200)
    expect(filteredPage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/users/followers?limit=1&after=${encodeURIComponent(filteredPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('treats LIKE metacharacters in q as literal characters, not wildcards', async () => {
    const owner = await createTestUser({ username: safeUsername('users-q-escape-owner') })
    const follower = await createTestUser({ username: safeUsername('users-q-escape-follower') })
    if (!owner || !follower) throw new Error('Failed to create users')

    await followUser(follower, owner)

    // '_' is a SQL LIKE single-character wildcard; unescaped, 'users%' would match this
    // follower's real prefix. It must be treated as a literal char that cannot match.
    const page = await createRequest()
      .get(`/api/v1/users/${owner.id}/users/followers?q=${encodeURIComponent('users_q_escape')}`)
      .expect(200)

    expect(page.body.results).toEqual([])
  })
})
