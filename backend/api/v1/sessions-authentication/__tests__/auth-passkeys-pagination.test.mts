import { describe, it, expect } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestPasskey } from '@voucha/test-helpers'
import { encodeScopedUuidCursor } from '@modules/pagination'
import '../index.mts'

describe('GET /api/v1/auth/passkeys pagination', () => {
  it('returns empty results with null cursors for a user with no passkeys', async () => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)

    const res = await req.get('/api/v1/auth/passkeys').expect(200)
    expect(res.body.results).toEqual([])
    expect(res.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('returns a partial page with has_next_page false and a null end_cursor', async () => {
    const user = await createTestUser()
    await insertTestPasskey(user.id, `partial-${Date.now()}`)

    const req = createRequest()
    await req.authenticateAs(user)
    const res = await req.get('/api/v1/auth/passkeys?limit=5').expect(200)

    expect(res.body.results).toHaveLength(1)
    expect(res.body.page_info.has_next_page).toBe(false)
    expect(res.body.page_info.end_cursor).toBeNull()
    expect(res.body.page_info.start_cursor).not.toBeNull()
  })

  it('returns has_next_page false when results exactly fill the limit', async () => {
    const user = await createTestUser()
    const suffix = `exact-${Date.now()}`
    await insertTestPasskey(user.id, `${suffix}-a`)
    await insertTestPasskey(user.id, `${suffix}-b`)

    const req = createRequest()
    await req.authenticateAs(user)
    const res = await req.get('/api/v1/auth/passkeys?limit=2').expect(200)

    expect(res.body.results).toHaveLength(2)
    expect(res.body.page_info.has_next_page).toBe(false)
  })

  it('paginates across multiple pages without duplicates or gaps', async () => {
    const user = await createTestUser()
    const suffix = `multi-${Date.now()}`
    const first = await insertTestPasskey(user.id, `${suffix}-a`)
    const second = await insertTestPasskey(user.id, `${suffix}-b`)
    const third = await insertTestPasskey(user.id, `${suffix}-c`)

    const req = createRequest()
    await req.authenticateAs(user)

    const page1 = await req.get('/api/v1/auth/passkeys?limit=2').expect(200)
    expect(page1.body.results.map((p: { id: string }) => p.id)).toEqual([first.id, second.id])
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()

    const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
    const page2 = await req.get(`/api/v1/auth/passkeys?limit=2&after=${cursor}`).expect(200)
    expect(page2.body.results.map((p: { id: string }) => p.id)).toEqual([third.id])
    expect(page2.body.page_info.has_next_page).toBe(false)
  })

  it('resolves equal-timestamp ties by id ascending', async () => {
    const user = await createTestUser()
    // Date.now() (not a fixed date) keeps these UUIDs unique across repeated local test runs
    // against a persistent dev DB, since the id is a real primary key.
    const msecs = Date.now()
    const idLow = v7({ msecs, random: new Uint8Array(16).fill(0) })
    const idHigh = v7({ msecs, random: new Uint8Array(16).fill(255) })
    // Insert in reverse order to prove ordering comes from the query, not insertion order.
    // Suffix carries `msecs` too: credential_id is globally unique, so a fixed suffix would
    // collide across repeated local runs against a persistent dev DB.
    await insertTestPasskey(user.id, `tie-high-${msecs}`, idHigh)
    await insertTestPasskey(user.id, `tie-low-${msecs}`, idLow)

    const req = createRequest()
    await req.authenticateAs(user)

    const page1 = await req.get('/api/v1/auth/passkeys?limit=1').expect(200)
    expect(page1.body.results[0].id).toBe(idLow)
    expect(page1.body.page_info.has_next_page).toBe(true)

    const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
    const page2 = await req.get(`/api/v1/auth/passkeys?limit=1&after=${cursor}`).expect(200)
    expect(page2.body.results[0].id).toBe(idHigh)
    expect(page2.body.page_info.has_next_page).toBe(false)
  })

  it('rejects a malformed cursor with 400', async () => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)

    await req.get('/api/v1/auth/passkeys?after=not-a-real-cursor').expect(400)
  })

  it('rejects a cursor minted for another user with 400', async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()
    await insertTestPasskey(userA.id, `cross-user-${Date.now()}`)

    const reqA = createRequest()
    await reqA.authenticateAs(userA)
    const pageA = await reqA.get('/api/v1/auth/passkeys?limit=1').expect(200)
    const cursor = pageA.body.page_info.start_cursor as string
    expect(cursor).not.toBeNull()

    const reqB = createRequest()
    await reqB.authenticateAs(userB)
    await reqB.get(`/api/v1/auth/passkeys?after=${encodeURIComponent(cursor)}`).expect(400)
  })

  it('rejects a cursor minted for the totp endpoint with 400 (cross-endpoint replay)', async () => {
    const user = await createTestUser()
    const wrongScope = encodeScopedUuidCursor(v7(), `totp:${user.id}:created-at-asc-id-asc`)

    const req = createRequest()
    await req.authenticateAs(user)
    await req.get(`/api/v1/auth/passkeys?after=${encodeURIComponent(wrongScope)}`).expect(400)
  })
})
