import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, safeUsername, suspendTestUser } from '@voucha/test-helpers'
import { encodeScopedAliasCursor } from '@modules/pagination'
import { usersSearchCursorScope } from '@services/users'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

function longestCommonPrefix(values: string[]): string {
  return values.reduce((prefix, value) => {
    let i = 0
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i++
    return prefix.slice(0, i)
  })
}

describe('GET /api/v1/users?q=', () => {
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/users?q=test').expect(401)
  })

  it('returns matching users when authenticated', async () => {
    const username = safeUsername('usersqapi')
    const user = await createTestUser({ username })
    const requester = await createTestUser({ username: safeUsername('users-qauth') })
    const request = createRequest()
    await request.authenticateAs(requester!)

    const response = await request.get(`/api/v1/users?q=${username}`).expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.results.some((u: { id: string }) => u.id === user!.id)).toBe(true)
    expect(response.body.page_info).toMatchObject({
      has_next_page: false,
      end_cursor: null,
    })
    expect(response.body.page_info.start_cursor).toEqual(expect.any(String))
  })

  it('does not return private fields or email matches for non-admin users', async () => {
    const target = await createTestUser({ username: safeUsername('users-qprivate') })
    const requester = await createTestUser({ username: safeUsername('users-qprivate-auth') })
    const request = createRequest()
    await request.authenticateAs(requester!)

    const emailResponse = await request
      .get(`/api/v1/users?q=${encodeURIComponent(target!.email_address!)}`)
      .expect(200)

    expect(emailResponse.body.results).toEqual([])

    const usernameResponse = await request.get(`/api/v1/users?q=${target!.username}`).expect(200)
    const match = usernameResponse.body.results.find((u: { id: string }) => u.id === target!.id)
    expect(match).toBeDefined()
    expect(match.email_address).toBeUndefined()
    expect(match.suspended_at).toBeUndefined()
  })

  it('returns private status fields and exact email matches for admin users', async () => {
    const target = await createTestUser({ username: safeUsername('users-qadmin') })
    await suspendTestUser(target!.id)
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)

    const response = await request
      .get(`/api/v1/users?q=${encodeURIComponent(target!.email_address!)}`)
      .expect(200)

    const match = response.body.results.find((u: { id: string }) => u.id === target!.id)
    expect(match).toBeDefined()
    expect(match.email_address).toBe(target!.email_address)
    expect(match.suspended_at).toBeTruthy()
  })

  it('returns exact ID matches for admin users', async () => {
    const target = await createTestUser({ username: safeUsername('users-qadminid') })
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)

    const response = await request.get(`/api/v1/users?q=${target!.id}`).expect(200)

    expect(response.body.results.some((u: { id: string }) => u.id === target!.id)).toBe(true)
  })

  it('paginates past a username-less row using the returned end_cursor', async () => {
    const withoutUsername = await createTestUser({ noUsername: true })
    const withUsername = await createTestUser({ username: `${withoutUsername!.id}-b` })
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)

    const firstPage = await request
      .get(`/api/v1/users?q=${withoutUsername!.id}&limit=1`)
      .expect(200)

    expect(firstPage.body.results.map((u: { id: string }) => u.id)).toEqual([withoutUsername!.id])
    expect(firstPage.body.page_info.has_next_page).toBe(true)
    expect(firstPage.body.page_info.end_cursor).toEqual(expect.any(String))

    const secondPage = await request
      .get(
        `/api/v1/users?q=${withoutUsername!.id}&limit=1&after=${encodeURIComponent(firstPage.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(secondPage.body.results.map((u: { id: string }) => u.id)).toEqual([withUsername!.id])
  })

  it('returns empty results for empty query', async () => {
    const requester = await createTestUser({ username: safeUsername('users-qempty') })
    const request = createRequest()
    await request.authenticateAs(requester!)

    const response = await request.get('/api/v1/users?q=').expect(200)

    expect(response.body.results).toEqual([])
  })

  it('returns has_next_page false and a null end_cursor when results exactly fill the limit', async () => {
    const label = `users-qexact-${randomSuffix()}`
    const [userA, userB] = await Promise.all([
      createTestUser({ username: safeUsername(label) }),
      createTestUser({ username: safeUsername(label) }),
    ])
    const prefix = longestCommonPrefix([
      userA!.username!.toLowerCase(),
      userB!.username!.toLowerCase(),
    ])
    const requester = await createTestUser({ username: safeUsername('users-qexact-requester') })
    const request = createRequest()
    await request.authenticateAs(requester!)

    const response = await request
      .get(`/api/v1/users?q=${encodeURIComponent(prefix)}&limit=2`)
      .expect(200)

    expect(response.body.results).toHaveLength(2)
    expect(response.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(response.body.page_info.start_cursor).toEqual(expect.any(String))
  })

  it('paginates matching users across multiple pages without duplicates or gaps', async () => {
    const label = `users-qmulti-${randomSuffix()}`
    const [userA, userB, userC] = await Promise.all([
      createTestUser({ username: safeUsername(label) }),
      createTestUser({ username: safeUsername(label) }),
      createTestUser({ username: safeUsername(label) }),
    ])
    const created = [userA!, userB!, userC!]
    const prefix = longestCommonPrefix(created.map(u => u.username!.toLowerCase()))
    const expectedIds = [...created]
      .sort((a, b) => a.username!.toLowerCase().localeCompare(b.username!.toLowerCase()))
      .map(u => u.id)

    const requester = await createTestUser({ username: safeUsername('users-qmulti-requester') })
    const request = createRequest()
    await request.authenticateAs(requester!)

    const collected: string[] = []
    let after: string | undefined
    for (let page = 0; page < created.length + 1; page++) {
      const cursorParam = after ? `&after=${encodeURIComponent(after)}` : ''
      const response = await request
        .get(`/api/v1/users?q=${encodeURIComponent(prefix)}&limit=1${cursorParam}`)
        .expect(200)

      expect(response.body.results.length).toBeLessThanOrEqual(1)
      if (response.body.results.length === 0) break
      collected.push(response.body.results[0].id)

      if (!response.body.page_info.has_next_page) break
      expect(response.body.page_info.end_cursor).toEqual(expect.any(String))
      after = response.body.page_info.end_cursor
    }

    expect(collected).toEqual(expectedIds)
  })

  it('returns 400 for a malformed cursor', async () => {
    const requester = await createTestUser({ username: safeUsername('users-qbadcursor') })
    const request = createRequest()
    await request.authenticateAs(requester!)

    await request.get('/api/v1/users?q=test&after=not-a-real-cursor').expect(400)
  })

  it('returns 400 when a cursor is replayed against a different query scope', async () => {
    const requester = await createTestUser({ username: safeUsername('users-qscope') })
    const request = createRequest()
    await request.authenticateAs(requester!)

    const wrongScopeCursor = encodeScopedAliasCursor(
      'someone',
      usersSearchCursorScope({ query: 'a-different-query', admin: false }),
    )

    await request
      .get(`/api/v1/users?q=test&after=${encodeURIComponent(wrongScopeCursor)}`)
      .expect(400)
  })

  it('returns 400 when an admin cursor is replayed against the public view', async () => {
    const target = await createTestUser({ username: safeUsername('users-qscopeadmin') })
    const requester = await createTestUser({ username: safeUsername('users-qscopeadmin-auth') })
    const request = createRequest()
    await request.authenticateAs(requester!)

    const adminCursor = encodeScopedAliasCursor(
      target!.username!.toLowerCase(),
      usersSearchCursorScope({ query: 'test', admin: true }),
    )

    await request.get(`/api/v1/users?q=test&after=${encodeURIComponent(adminCursor)}`).expect(400)
  })
})
