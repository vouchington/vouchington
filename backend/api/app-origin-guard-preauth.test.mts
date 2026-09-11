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
})

function guardedRequest(app: ReturnType<typeof createVouchaApiApp>): ReturnType<typeof request> {
  return request(createOriginGuardedListener(app.callback(), WORKER_HEADER_VALUE))
}
