import { createRequest } from '@voucha/api/test-helpers/server'
import { describe, expect, it } from 'vitest'

describe('GET /api/v1/currencies', () => {
  it('returns the public paginated currency catalog', async () => {
    const response = await createRequest().get('/api/v1/currencies?limit=2').expect(200)
    expect(response.body.results).toHaveLength(2)
    expect(response.body.results[0]).toEqual({
      code: 'aud',
      minor_unit_exponent: 2,
    })
    expect(response.body.page_info.has_next_page).toBe(true)
    expect(response.headers['cache-control']).toContain('public')
  })

  it('rejects malformed cursors', async () => {
    await createRequest().get('/api/v1/currencies?after=not-a-cursor').expect(400)
  })
})
