import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('GET /api/v1/copyright-jurisdiction-availability', () => {
  it('is anonymous, uncached, and reports only current intake availability', async () => {
    const response = await createRequest()
      .get('/api/v1/copyright-jurisdiction-availability')
      .expect(200)

    expect(response.headers['cache-control']).toContain('no-store')
    expect(Object.keys(response.body)).toEqual(['copyright_jurisdiction_availability'])
    expect(Object.keys(response.body.copyright_jurisdiction_availability).toSorted()).toEqual([
      'eu_dsa',
      'uk',
    ])
    expect(typeof response.body.copyright_jurisdiction_availability.eu_dsa).toBe('boolean')
    expect(typeof response.body.copyright_jurisdiction_availability.uk).toBe('boolean')
  })
})
