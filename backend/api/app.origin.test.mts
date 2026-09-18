import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createOriginGuardedListener, createVouchaApiApp } from './app.mts'
import { WORKER_SECRET_EXEMPT_PATHS } from './app-origin-guard.mts'
import { createConnection } from 'node:net'
import { createServer } from 'node:http'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'

const WORKER_HEADER_VALUE = '0123456789abcdef0123456789abcdef'

describe('API origin guards', () => {
  // Every exempt path is a caller that cannot supply the CF worker secret — see
  // docs/overview/architecture/event-ingress.md. This must stay flat, never silently grow.
  it('keeps the worker-secret exempt path list to its known, reviewed entries', () => {
    expect([...WORKER_SECRET_EXEMPT_PATHS].sort()).toEqual(['/infra/ping'])
  })

  it('rejects requests without the CF worker secret', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').get(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app).get('/api/private')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-xss-protection']).toBe('0')
  })

  it('allows requests with the CF worker secret', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').get(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .get('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('rejects duplicate CF worker secret headers', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').get(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .get('/api/private')
      .set('x-cf-worker-secret', ['invalid', WORKER_HEADER_VALUE] as unknown as string)

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })

  it('allows configured infrastructure paths without the CF worker secret', async () => {
    const app = createVouchaApiApp()
    app.route('/infra/ping').get(ctx => ctx.json({ ok: true }))

    const server = createServer(createOriginGuardedListener(app.callback(), WORKER_HEADER_VALUE))
    await listenOnEphemeralPort(server, '127.0.0.1')

    try {
      const agent = request(server)
      await expect(agent.get('/infra/ping')).resolves.toMatchObject({
        status: 200,
        body: { ok: true },
      })
    } finally {
      await closeServer(server)
    }
  })

  it('normalizes trailing slashes before checking worker-secret exempt paths', async () => {
    const app = createVouchaApiApp()
    app.route('/infra/ping').get(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app).get('/infra/ping/')

    expect(response.status).toBe(404)
    expect(response.text).not.toBe('Forbidden')
  })

  it('does not decode encoded worker-secret exempt path separators', async () => {
    const app = createVouchaApiApp()
    app.route('/infra/ping').get(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app).get('/infra%2Fping')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })

  it('rejects cross-site cookie mutations before reaching routes', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cookie', 'st=session')
      .set('sec-fetch-site', 'cross-site')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
  })

  it('handles malformed absolute-form request targets inside origin guards', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').get(ctx => ctx.json({ ok: true }))

    const server = createServer(createOriginGuardedListener(app.callback(), WORKER_HEADER_VALUE))
    const port = await listenOnEphemeralPort(server, '127.0.0.1')

    try {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = createConnection(port, '127.0.0.1', () => {
          socket.end('GET http://[invalid HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
        })
        let data = ''
        socket.setEncoding('utf8')
        socket.on('data', chunk => {
          data += chunk
        })
        socket.on('end', () => resolve(data))
        socket.on('error', reject)
      })

      expect(response).toContain('403 Forbidden')
      expect(response).toContain('x-frame-options: SAMEORIGIN')
    } finally {
      await closeServer(server)
    }
  })

  it('allows same-origin cookie mutations', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cookie', 'st=session')
      .set('sec-fetch-site', 'same-origin')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('rejects cookie mutations with missing origin metadata', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cookie', 'st=session')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })

  it('allows cookie mutations when origin matches forwarded host and proto', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cookie', 'st=session')
      .set('origin', 'https://example.com')
      .set('x-forwarded-host', 'example.com:443')
      .set('x-forwarded-proto', 'HTTPS')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('rejects cookie mutations when origin does not match forwarded host', async () => {
    const app = createVouchaApiApp()
    app.route('/api/private').post(ctx => ctx.json({ ok: true }))

    const response = await guardedRequest(app)
      .post('/api/private')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cookie', 'st=session')
      .set('origin', 'https://evil.example')
      .set('x-forwarded-host', 'example.com')
      .set('x-forwarded-proto', 'https')

    expect(response.status).toBe(403)
    expect(response.text).toBe('Forbidden')
  })

  it('trusts Cloudflare client IP headers through the extracted API server', async () => {
    const app = createVouchaApiApp()
    app.route('/api/ip').get(ctx => ctx.json({ ip: ctx.ip }))

    const response = await guardedRequest(app)
      .get('/api/ip')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cf-connecting-ip', '203.0.113.5')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ip: '203.0.113.5' })
  })

  it('prefers Cloudflare client IP over forwarded IP headers', async () => {
    const app = createVouchaApiApp()
    app.route('/api/ip').get(ctx => ctx.json({ ip: ctx.ip }))

    const response = await guardedRequest(app)
      .get('/api/ip')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('cf-connecting-ip', '203.0.113.5')
      .set('x-forwarded-for', '198.51.100.1, 198.51.100.2')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ip: '203.0.113.5' })
  })

  it('uses the first forwarded IP when Cloudflare client IP is absent', async () => {
    const app = createVouchaApiApp()
    app.route('/api/ip').get(ctx => ctx.json({ ip: ctx.ip }))

    const response = await guardedRequest(app)
      .get('/api/ip')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)
      .set('x-forwarded-for', '198.51.100.1, 198.51.100.2')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ip: '198.51.100.1' })
  })

  it('falls back to the socket IP when forwarded headers are absent', async () => {
    const app = createVouchaApiApp()
    app.route('/api/ip').get(ctx => ctx.json({ ip: ctx.ip }))

    const response = await guardedRequest(app)
      .get('/api/ip')
      .set('x-cf-worker-secret', WORKER_HEADER_VALUE)

    expect(response.status).toBe(200)
    expect(response.body.ip).toEqual(expect.stringContaining('127.0.0.1'))
  })
})

function guardedRequest(app: ReturnType<typeof createVouchaApiApp>): ReturnType<typeof request> {
  return request(createOriginGuardedListener(app.callback(), WORKER_HEADER_VALUE))
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}
