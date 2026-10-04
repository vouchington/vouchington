/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { expect, test } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { encodeScopedUuidCursor } from '@modules/pagination'

type InsertedCredential = { id: string }

/** Shared passkey and TOTP list pagination. Call from a literal `describe` in the route test. */
export function registerScopedCredentialPaginationTests(options: {
  path: string
  configureRuntimeLimits: () => void
  insert: (userId: string, suffix: string, id?: string) => Promise<InsertedCredential>
  foreignScopePrefix: 'passkeys' | 'totp'
  tieSuffix: (which: 'high' | 'low', msecs: number) => string
}): void {
  const { path, insert, foreignScopePrefix, tieSuffix } = options

  test('uses runtime default and maximum through the shared MFA list helper', async () => {
    const user = await createTestUser()
    await insert(user.id, `runtime-${user.id}-a`)
    await insert(user.id, `runtime-${user.id}-b`)
    options.configureRuntimeLimits()
    const request = createRequest()
    await request.authenticateAs(user)
    for (const suffix of ['', '?limit=100']) {
      const response = await request.get(`${path}${suffix}`).expect(200)
      expect(response.body.results).toHaveLength(1)
      expect(response.body.page_info.has_next_page).toBe(true)
    }
  })

  test('returns empty results with null cursors when the user has no credentials', async () => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)

    const res = await req.get(path).expect(200)
    expect(res.body.results).toEqual([])
    expect(res.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  test('returns a partial page with has_next_page false and a null end_cursor', async () => {
    const user = await createTestUser()
    await insert(user.id, `partial-${Date.now()}`)

    const req = createRequest()
    await req.authenticateAs(user)
    const res = await req.get(`${path}?limit=5`).expect(200)

    expect(res.body.results).toHaveLength(1)
    expect(res.body.page_info.has_next_page).toBe(false)
    expect(res.body.page_info.end_cursor).toBeNull()
    expect(res.body.page_info.start_cursor).not.toBeNull()
  })

  test('returns has_next_page false when results exactly fill the limit', async () => {
    const user = await createTestUser()
    const suffix = `exact-${Date.now()}`
    await insert(user.id, `${suffix}-a`)
    await insert(user.id, `${suffix}-b`)

    const req = createRequest()
    await req.authenticateAs(user)
    const res = await req.get(`${path}?limit=2`).expect(200)

    expect(res.body.results).toHaveLength(2)
    expect(res.body.page_info.has_next_page).toBe(false)
  })

  test('paginates across multiple pages without duplicates or gaps', async () => {
    const user = await createTestUser()
    const suffix = `multi-${Date.now()}`
    const first = await insert(user.id, `${suffix}-a`)
    const second = await insert(user.id, `${suffix}-b`)
    const third = await insert(user.id, `${suffix}-c`)

    const req = createRequest()
    await req.authenticateAs(user)

    const page1 = await req.get(`${path}?limit=2`).expect(200)
    expect(page1.body.results.map((row: { id: string }) => row.id)).toEqual([first.id, second.id])
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()

    const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
    const page2 = await req.get(`${path}?limit=2&after=${cursor}`).expect(200)
    expect(page2.body.results.map((row: { id: string }) => row.id)).toEqual([third.id])
    expect(page2.body.page_info.has_next_page).toBe(false)
  })

  test('resolves equal-timestamp ties by id ascending', async () => {
    const user = await createTestUser()
    // Date.now() keeps these UUIDs unique across repeated runs against a persistent dev DB.
    const msecs = Date.now()
    const idLow = v7({ msecs, random: new Uint8Array(16).fill(0) })
    const idHigh = v7({ msecs, random: new Uint8Array(16).fill(255) })
    await insert(user.id, tieSuffix('high', msecs), idHigh)
    await insert(user.id, tieSuffix('low', msecs), idLow)

    const req = createRequest()
    await req.authenticateAs(user)

    const page1 = await req.get(`${path}?limit=1`).expect(200)
    expect(page1.body.results[0].id).toBe(idLow)
    expect(page1.body.page_info.has_next_page).toBe(true)

    const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
    const page2 = await req.get(`${path}?limit=1&after=${cursor}`).expect(200)
    expect(page2.body.results[0].id).toBe(idHigh)
    expect(page2.body.page_info.has_next_page).toBe(false)
  })

  test('rejects a malformed cursor with 400', async () => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)

    await req.get(`${path}?after=not-a-real-cursor`).expect(400)
  })

  test('clamps an oversized limit to the maximum instead of failing the request contract', async () => {
    const user = await createTestUser()
    await insert(user.id, `clamp-${Date.now()}`)
    const req = createRequest()
    await req.authenticateAs(user)

    const res = await req.get(`${path}?limit=500`).expect(200)
    expect(res.body.results).toHaveLength(1)
  })

  test.each(['abc', '0', '-1', '1.5'])('rejects limit=%s with the parser 400', async limit => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)

    await req.get(`${path}?limit=${limit}`).expect(400)
  })

  test('returns a bare 401 without a schema diagnostic for an anonymous malformed query', async () => {
    const res = await createRequest().get(`${path}?limit=abc&after=x&after=y`).expect(401)
    expect(res.body.message).toBe('Unauthorized')
  })

  test('rejects a cursor minted for another user with 400', async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()
    await insert(userA.id, `cross-user-${Date.now()}`)

    const reqA = createRequest()
    await reqA.authenticateAs(userA)
    const pageA = await reqA.get(`${path}?limit=1`).expect(200)
    const cursor = pageA.body.page_info.start_cursor as string
    expect(cursor).not.toBeNull()

    const reqB = createRequest()
    await reqB.authenticateAs(userB)
    await reqB.get(`${path}?after=${encodeURIComponent(cursor)}`).expect(400)
  })

  test('rejects a cursor minted for the other credential endpoint with 400', async () => {
    const user = await createTestUser()
    const wrongScope = encodeScopedUuidCursor(
      v7(),
      `${foreignScopePrefix}:${user.id}:created-at-asc-id-asc`,
    )

    const req = createRequest()
    await req.authenticateAs(user)
    await req.get(`${path}?after=${encodeURIComponent(wrongScope)}`).expect(400)
  })
}
