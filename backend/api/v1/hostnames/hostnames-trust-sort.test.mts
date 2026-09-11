import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/hostnames — trust sort pagination', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('returns paginated results sorted by trust score with cursor', async () => {
    const prefix = Math.random().toString(36).slice(2, 8)
    const ids = await Promise.all([
      insertTestUrlHostname({ hostname: `trust-a-${prefix}.example.com` }),
      insertTestUrlHostname({ hostname: `trust-b-${prefix}.example.com` }),
      insertTestUrlHostname({ hostname: `trust-c-${prefix}.example.com` }),
    ])
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .get(`/api/v1/hostnames?query=${prefix}&sort=trust&limit=2`)
      .expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info.has_next_page).toBe(true)
    expect(response.body.page_info.end_cursor).toBeTypeOf('string')

    const page2 = await request
      .get(
        `/api/v1/hostnames?query=${prefix}&sort=trust&limit=2&after=${response.body.page_info.end_cursor}`,
      )
      .expect(200)

    expect(Array.isArray(page2.body.results)).toBe(true)
    expect(page2.body.results.length).toBe(1)
    expect(page2.body.page_info.has_next_page).toBe(false)

    const allIds = [...response.body.results, ...page2.body.results].map(
      (r: { id: string }) => r.id,
    )
    for (const id of ids) {
      expect(allIds).toContain(id)
    }
  })
})
