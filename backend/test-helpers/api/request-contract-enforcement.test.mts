import { createServer, type Server } from 'node:http'
import { createApp } from '@jongleberry/api-server'
import { RuntimeRequestValidatorRegistry } from '../../services/runtime-request-validation/index.mts'
import undici from 'undici'
import { describe, expect, it } from 'vitest'
import { validateRequestContract } from '../../api/response-helpers.mts'
import {
  installRequestContractEnforcement,
  takeRequestContractViolations,
  useRequestContractRegistry,
} from './request-contract-enforcement.mts'

async function runRequest(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  requestBody?: string,
): Promise<{ status: number; text: string; json: () => unknown }> {
  const dispatcher = new undici.Agent()
  const server: Server = createServer(app.callback())
  server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address')
    const response = await undici.fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      dispatcher,
      ...(requestBody !== undefined
        ? { body: requestBody, headers: { 'content-type': 'application/json' } }
        : {}),
    })
    const text = await response.text()
    return { status: response.status, text, json: () => JSON.parse(text) as unknown }
  } finally {
    const closed = new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()))
    })
    server.closeAllConnections()
    await closed
    await dispatcher.close()
  }
}

function createEnforcedApp() {
  installRequestContractEnforcement()
  takeRequestContractViolations()
  return createApp()
}

describe('test-time request contract enforcement', () => {
  it('records a violation when a contracted handler returns without validation', async () => {
    const app = createEnforcedApp()
    app.route('/api/v1/my/api-keys').post(ctx => ctx.json({ created: true }))

    const response = await runRequest(app, 'POST', '/api/v1/my/api-keys')

    expect(response.status).toBe(200)
    expect(takeRequestContractViolations()).toMatchObject([
      { code: 'REQUEST_CONTRACT_VALIDATION_MISSING' },
    ])
  })

  it('leaves an exempt protocol handler unchanged without a violation', async () => {
    const app = createEnforcedApp()
    app.route('/authorize').get(ctx => ctx.json({ protocol: true }))

    const response = await runRequest(app, 'GET', '/authorize')

    expect(response.json()).toEqual({ protocol: true })
    expect(takeRequestContractViolations()).toEqual([])
  })

  it('leaves a contracted carrier-free handler unchanged without a violation', async () => {
    const app = createEnforcedApp()
    useRequestContractRegistry(
      app,
      new RuntimeRequestValidatorRegistry({
        version: 1,
        source: 'checked-in-request-contracts',
        components: {},
        operations: { 'GET:/carrier-free': {} },
      }),
    )
    app.route('/carrier-free').get(ctx => ctx.json({ ok: true }))

    const response = await runRequest(app, 'GET', '/carrier-free')

    expect(response.json()).toEqual({ ok: true })
    expect(takeRequestContractViolations()).toEqual([])
  })

  it('preserves a pre-validation 401 without a violation', async () => {
    const app = createEnforcedApp()
    app.route('/api/v1/my/api-keys').post(ctx => ctx.throw(401, 'Unauthorized'))

    const response = await runRequest(app, 'POST', '/api/v1/my/api-keys')

    expect(response.status).toBe(401)
    expect(takeRequestContractViolations()).toEqual([])
  })

  it('keeps a same-key validation and its response unchanged', async () => {
    const app = createEnforcedApp()
    app.route('/api/v1/my/api-keys').post(async ctx => {
      const body = await ctx.request.json()
      validateRequestContract(ctx, 'POST:/api/v1/my/api-keys', { body })
      ctx.json({ created: true })
    })

    const response = await runRequest(
      app,
      'POST',
      '/api/v1/my/api-keys',
      JSON.stringify({ label: 'My Key', permissions: ['rss:read'] }),
    )

    expect(response.json()).toEqual({ created: true })
    expect(takeRequestContractViolations()).toEqual([])
  })

  it('records a mismatch when a route validates with another operation key', async () => {
    const app = createEnforcedApp()
    app.route('/api/v1/my/api-keys').post(async ctx => {
      const body = await ctx.request.json()
      validateRequestContract(ctx, 'POST:/api/v1/conversations', { body })
      ctx.json({ created: true })
    })

    await runRequest(
      app,
      'POST',
      '/api/v1/my/api-keys',
      JSON.stringify({ label: 'My Key', permissions: ['rss:read'] }),
    )

    expect(takeRequestContractViolations()).toMatchObject([
      { code: 'REQUEST_CONTRACT_OPERATION_MISMATCH' },
    ])
  })

  it('records a mismatch even when the mis-keyed validation rejects the request', async () => {
    const app = createEnforcedApp()
    app.route('/api/v1/my/api-keys').post(ctx => {
      validateRequestContract(ctx, 'POST:/api/v1/conversations', { body: null })
    })

    const response = await runRequest(app, 'POST', '/api/v1/my/api-keys', '{}')

    expect(response.status).toBe(422)
    expect(takeRequestContractViolations()).toMatchObject([
      { code: 'REQUEST_CONTRACT_OPERATION_MISMATCH' },
    ])
  })
})
