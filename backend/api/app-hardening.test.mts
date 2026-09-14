import { Agent, createServer, type IncomingHttpHeaders } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createVouchaApiApp, VOUCHA_API_SERVER_OPTIONS } from './app.mts'
import {
  closeServer,
  listen,
  sendExpectedBody,
  sendHttpRequest,
  sendRawRequest,
  startListening,
} from '../test-helpers/api/http-boundary.mts'

const BODY_LIMIT_BYTES = VOUCHA_API_SERVER_OPTIONS.bodyLimit
const EXPECTED_SECURITY_HEADERS = {
  'x-xss-protection': '0',
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
} as const
const DISABLED_SECURITY_HEADERS = [
  'strict-transport-security',
  'referrer-policy',
  'x-dns-prefetch-control',
  'x-download-options',
  'x-permitted-cross-domain-policies',
] as const

describe('API server hardening', () => {
  it('pins HTTP method validation to the Node parser boundary', () => {
    expect(VOUCHA_API_SERVER_OPTIONS.strictHttpMethods).toBe(false)
  })

  it('pins the request body limit to 1 MiB', () => {
    expect(VOUCHA_API_SERVER_OPTIONS.bodyLimit).toBe(1024 * 1024)
  })

  it('rejects parser-unknown HTTP methods before application dispatch', async () => {
    const app = createVouchaApiApp()
    let applicationDispatched = false
    app.notFoundHandler(ctx => {
      applicationDispatched = true
      ctx.setStatus(404)
      ctx.json({ message: 'Not Found' })
    })
    const server = await listen(app.callback())

    try {
      const response = await sendRawRequest(
        server,
        'NOT-A-METHOD /probe HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n',
      )

      expect(response).toContain('HTTP/1.1 400 Bad Request')
      expect(applicationDispatched).toBe(false)
    } finally {
      await closeServer(server)
    }
  })

  it('drains an oversized declared-length body and reuses the connection', async () => {
    await expectOversizedBodyToPreserveConnection({
      'content-length': String(BODY_LIMIT_BYTES + 1),
    })
  })

  it('drains an oversized chunked body and reuses the connection', async () => {
    await expectOversizedBodyToPreserveConnection({ 'transfer-encoding': 'chunked' })
  })

  it('continues an expected oversized body before returning 413', async () => {
    const app = createBodyParsingApp()
    const listener = app.callback()
    const server = createServer()
    server.on('request', listener)
    server.on('checkContinue', listener)
    await startListening(server)

    try {
      const result = await sendExpectedBody(server, Buffer.alloc(BODY_LIMIT_BYTES + 1, 'x'))

      expect(result.continued).toBe(true)
      expect(result.statusCode).toBe(413)
    } finally {
      await closeServer(server)
    }
  })

  it('pins the backend security headers on successful responses', async () => {
    const app = createVouchaApiApp()
    app.route('/success').get(ctx => ctx.json({ ok: true }))
    const server = await listen(app.callback())

    try {
      const response = await sendHttpRequest(server, { method: 'GET', path: '/success' })

      expect(response.statusCode).toBe(200)
      expectBackendSecurityHeaders(response.headers)
    } finally {
      await closeServer(server)
    }
  })

  it('pins security headers on the fresh app framework-default plain-text 404 without CSP', async () => {
    const app = createVouchaApiApp()
    const server = await listen(app.callback())

    try {
      const response = await sendHttpRequest(server, { method: 'GET', path: '/missing' })

      expect(response.statusCode).toBe(404)
      expect(response.body).toBe('Not Found')
      expectBackendSecurityHeaders(response.headers)
      expect(response.headers['content-security-policy']).toBeUndefined()
    } finally {
      await closeServer(server)
    }
  })

  it('allows a route to override a pinned security header before sending', async () => {
    const app = createVouchaApiApp()
    app.route('/embedded').get(ctx => {
      ctx.set('X-Frame-Options', 'DENY')
      ctx.json({ ok: true })
    })
    const server = await listen(app.callback())

    try {
      const response = await sendHttpRequest(server, { method: 'GET', path: '/embedded' })

      expect(response.statusCode).toBe(200)
      expect(response.headers['x-frame-options']).toBe('DENY')
      expect(response.headers['x-xss-protection']).toBe('0')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
    } finally {
      await closeServer(server)
    }
  })
})

function createBodyParsingApp(): ReturnType<typeof createVouchaApiApp> {
  const app = createVouchaApiApp()
  app.route('/body').post(async ctx => ctx.json(await ctx.request.json()))
  app.route('/health').get(ctx => ctx.json({ ok: true }))
  return app
}

async function expectOversizedBodyToPreserveConnection(
  requestHeaders: IncomingHttpHeaders,
): Promise<void> {
  const app = createBodyParsingApp()
  const server = await listen(app.callback())
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })

  try {
    const oversized = await sendHttpRequest(
      server,
      {
        method: 'POST',
        path: '/body',
        headers: { 'content-type': 'application/json', ...requestHeaders },
      },
      [Buffer.alloc(BODY_LIMIT_BYTES, 'x'), Buffer.from('x')],
      agent,
    )
    const healthy = await sendHttpRequest(server, { method: 'GET', path: '/health' }, [], agent)

    expect(oversized.statusCode).toBe(413)
    expect(healthy.statusCode).toBe(200)
    expect(healthy.body).toBe('{"ok":true}')
    expect(healthy.socket).toBe(oversized.socket)
  } finally {
    agent.destroy()
    await closeServer(server)
  }
}

function expectBackendSecurityHeaders(headers: IncomingHttpHeaders): void {
  for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    expect(headers[name]).toBe(value)
  }
  for (const name of DISABLED_SECURITY_HEADERS) {
    expect(headers[name]).toBeUndefined()
  }
}
