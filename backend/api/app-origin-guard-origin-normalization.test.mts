import { describe, expect, it } from 'vitest'
import request from 'supertest'

import { createOriginGuardedListener, createVouchaApiApp } from './app.mts'

const WORKER_HEADER_VALUE = '0123456789abcdef0123456789abcdef'

describe('API origin guard origin normalization', () => {
  it('allows cookie mutations when HTTP origin differs only by default port', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cookie', 'st=session')
      .set('origin', 'http://example.com:80')
      .set('x-forwarded-host', 'example.com')
      .set('x-forwarded-proto', 'http')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('rejects cookie mutations with malformed origin values', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cookie', 'st=session')
      .set('origin', 'http://[invalid')
      .set('x-forwarded-host', 'example.com')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })

  it('rejects cookie mutations when forwarded proto is unsupported', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cookie', 'st=session')
      .set('origin', 'https://example.com')
      .set('x-forwarded-host', 'example.com')
      .set('x-forwarded-proto', 'gopher')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })
})

function guardedRequest(app: ReturnType<typeof createVouchaApiApp>): ReturnType<typeof request> {
  return request(createOriginGuardedListener(app.callback(), WORKER_HEADER_VALUE))
}
