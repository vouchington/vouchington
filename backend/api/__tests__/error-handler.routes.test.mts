import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import app from '@voucha/api/app'

app.route('/api/v1/__tests__/error-handler-boom').get(() => {
  throw Object.assign(new Error('sensitive internal detail'), { status: 500 })
})

app.route('/api/v1/__tests__/error-handler-statusless').get(() => {
  throw new Error('sensitive internal detail')
})

app.route('/api/v1/__tests__/error-handler-string').get(() => {
  const thrown: unknown = 'sensitive internal detail'
  return Promise.reject(thrown)
})

app.route('/api/v1/__tests__/error-handler-null').get(() => {
  const thrown: null = null
  return Promise.reject(thrown)
})

describe('app error handler', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sanitizes 5xx bodies in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const request = createRequest()
    const res = await request.get('/api/v1/__tests__/error-handler-boom').expect(500)
    expect(res.body).toEqual({ message: 'Internal Server Error', code: 'INTERNAL_ERROR' })
    expect(res.body.stack).toBeUndefined()
  })

  it('includes details for 5xx bodies outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const request = createRequest()
    const res = await request.get('/api/v1/__tests__/error-handler-boom').expect(500)
    expect(res.body.message).toBe('sensitive internal detail')
    expect(res.body.code).toBe('INTERNAL_ERROR')
    expect(res.body.stack).toContain('sensitive internal detail')
  })

  it('sanitizes 5xx bodies for status-less errors in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const request = createRequest()
    const res = await request.get('/api/v1/__tests__/error-handler-statusless').expect(500)
    expect(res.body).toEqual({ message: 'Internal Server Error', code: 'INTERNAL_ERROR' })
    expect(res.body.stack).toBeUndefined()
  })

  it('returns 500 for non-Error thrown strings in production without throwing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const request = createRequest()
    const res = await request.get('/api/v1/__tests__/error-handler-string').expect(500)
    expect(res.body).toEqual({ message: 'Internal Server Error', code: 'INTERNAL_ERROR' })
    expect(res.body.stack).toBeUndefined()
  })

  it('returns 500 for null throws in production without throwing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const request = createRequest()
    const res = await request.get('/api/v1/__tests__/error-handler-null').expect(500)
    expect(res.body).toEqual({ message: 'Internal Server Error', code: 'INTERNAL_ERROR' })
    expect(res.body.stack).toBeUndefined()
  })
})
