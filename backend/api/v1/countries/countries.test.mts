import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'

describe('GET /api/v1/countries', () => {
  it('should return a list of countries', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/countries').expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.results.length).toBeGreaterThan(0)

    const codes = response.body.results.map((c: { code: string }) => c.code)
    expect(codes).toContain('US')
    expect(codes).toContain('CA')
  })

  it('should return countries with id, code, and name fields', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/countries').expect(200)

    const country = response.body.results[0]
    expect(typeof country.id).toBe('number')
    expect(typeof country.code).toBe('string')
    expect(typeof country.name).toBe('string')
  })

  it('should be accessible without authentication', async () => {
    const request = createRequest()
    await request.get('/api/v1/countries').expect(200)
  })
})
