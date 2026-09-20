import { describe, expect, it } from 'vitest'
import request from 'supertest'

import { createOriginGuardedListener, createVouchaApiApp } from './app.mts'

const WORKER_HEADER_VALUE = '0123456789abcdef0123456789abcdef'

// The origin guard applies to all mutating requests carrying a browser-context signal (Origin or
// Sec-Fetch-Site), not only cookie-bearing ones, so it covers pre-auth routes (login/signup).
// Requests with no browser signal are treated as server-to-server and allowed through.
describe('API origin guard — pre-auth and server-to-server coverage', () => {
  it('rejects cross-site mutations even without a session cookie', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('sec-fetch-site', 'cross-site')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })

  it('rejects mismatched-origin mutations without a session cookie', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('origin', 'https://evil.example')
      .set('x-forwarded-host', 'example.com')
      .set('x-forwarded-proto', 'https')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })

  it('allows same-origin mutations without a session cookie', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('sec-fetch-site', 'same-origin')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('allows server-to-server mutations with no browser-context signals', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it.each(['/register', '/revoke', '/token'])(
    'allows cross-site OAuth protocol calls through to protocol authentication at %s',
    async path => {
      const app = createVouchaApiApp()
      app.route(path).post(ctx => ctx.json({ reached: true }))

      const response = await guardedRequest(app)
        .post(path)
        .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
        .set('origin', 'https://client.example')
        .set('sec-fetch-site', 'cross-site')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ reached: true })
    },
  )

  it('keeps the cookie-authenticated OAuth consent mutation behind the origin guard', async () => {
    const app = createVouchaApiApp()
    app
      .route('/api/v1/oauth/authorization-requests/:id/decisions')
      .post(ctx => ctx.json({ reached: true }))

    const response = await guardedRequest(app)
      .post('/api/v1/oauth/authorization-requests/00000000-0000-7000-8000-000000000001/decisions')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('origin', 'https://client.example')
      .set('sec-fetch-site', 'cross-site')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })
})

function guardedRequest(app: ReturnType<typeof createVouchaApiApp>): ReturnType<typeof request> {
  return request(createOriginGuardedListener(app.callback(), WORKER_HEADER_VALUE))
}
