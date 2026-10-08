import { createServer, type Server } from 'node:http'
import { createApp } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import { describe, expect, it, vi } from 'vitest'
import { validateRequestContract } from './response-helpers.mts'
import { sentryCaptureExceptionMock } from '../test-helpers/vitest.setup.sentry-mock.mts'
import {
  installRequestContractEnforcement,
  REQUEST_CONTRACT_VALIDATION_MISSING,
} from './request-contract-enforcement.mts'

async function runRequest(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  requestBody?: string,
): Promise<{ status: number; text: string; json: () => unknown }> {
  const server: Server = createServer(app.callback())
  server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address')
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
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
  }
}

function createEnforcedApp(report: (error: Error) => void) {
  const app = createApp()
  installRequestContractEnforcement(app, report)
  return app
}

describe('runtime request contract enforcement', () => {
  it('returns a stable 500 and reports once when a contracted handler returns without validation', async () => {
    sentryCaptureExceptionMock.mockClear()
    const app = createEnforcedApp(onError)
    app.route('/api/v1/my/api-keys').post(() => {})

    const response = await runRequest(app, 'POST', '/api/v1/my/api-keys')

    expect(response.status).toBe(500)
    expect(response.json()).toEqual({
      message: 'Request validation did not run',
      code: REQUEST_CONTRACT_VALIDATION_MISSING,
    })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1)
    expect(sentryCaptureExceptionMock.mock.calls[0]?.[0]).toMatchObject({
      code: REQUEST_CONTRACT_VALIDATION_MISSING,
      tags: { route_key: 'POST:/api/v1/my/api-keys' },
    })
    expect(sentryCaptureExceptionMock.mock.calls[0]?.[1]).toMatchObject({
      tags: { route_key: 'POST:/api/v1/my/api-keys' },
    })
    // This test deliberately owns the report; leave no unexpected report for suite cleanup.
    sentryCaptureExceptionMock.mockClear()
  })

  it('reports a missing validation after a response started without changing that response', async () => {
    const report = vi.fn<(error: Error) => void>()
    const app = createEnforcedApp(report)
    app.route('/api/v1/my/api-keys/:id').delete(ctx => ctx.json({ deleted: true }))

    const response = await runRequest(app, 'DELETE', '/api/v1/my/api-keys/abc')

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ deleted: true })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0]?.[0]).toMatchObject({
      tags: { route_key: 'DELETE:/api/v1/my/api-keys/:id' },
    })
  })

  it('leaves an exempt protocol handler unchanged without reporting', async () => {
    const report = vi.fn<(error: Error) => void>()
    const app = createEnforcedApp(report)
    app.route('/authorize').get(ctx => ctx.json({ protocol: true }))

    const protocolResponse = await runRequest(app, 'GET', '/authorize')

    expect(protocolResponse.status).toBe(200)
    expect(protocolResponse.json()).toEqual({ protocol: true })
    expect(report).not.toHaveBeenCalled()
  })

  it('leaves a contracted carrier-free handler unchanged without reporting', async () => {
    const report = vi.fn<(error: Error) => void>()
    const app = createApp()
    const registry = new RuntimeRequestValidatorRegistry({
      version: 1,
      source: 'checked-in-request-contracts',
      components: {},
      operations: { 'GET:/carrier-free': {} },
    })
    installRequestContractEnforcement(app, report, registry)
    app.route('/carrier-free').get(ctx => ctx.json({ ok: true }))

    const response = await runRequest(app, 'GET', '/carrier-free')

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    expect(report).not.toHaveBeenCalled()
  })

  it('preserves a pre-validation 401 without reporting a missing validation', async () => {
    const report = vi.fn<(error: Error) => void>()
    const app = createEnforcedApp(report)
    app.route('/api/v1/my/api-keys').post(ctx => ctx.throw(401, 'Unauthorized'))

    const response = await runRequest(app, 'POST', '/api/v1/my/api-keys')

    expect(response.status).toBe(401)
    expect(report).not.toHaveBeenCalled()
  })

  it('keeps a same-key validation and its response unchanged', async () => {
    const report = vi.fn<(error: Error) => void>()
    const app = createEnforcedApp(report)
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

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ created: true })
    expect(report).not.toHaveBeenCalled()
  })

  it('stops a service call when a route validates with another operation key', async () => {
    const report = vi.fn<(error: Error) => void>()
    const service = vi.fn<() => void>()
    const app = createEnforcedApp(report)
    app.route('/api/v1/my/api-keys').post(async ctx => {
      const body = await ctx.request.json()
      validateRequestContract(ctx, 'POST:/api/v1/conversations', { body })
      service()
      ctx.json({ created: true })
    })

    const response = await runRequest(
      app,
      'POST',
      '/api/v1/my/api-keys',
      JSON.stringify({ label: 'My Key', permissions: ['rss:read'] }),
    )

    expect(response.status).toBe(500)
    expect(service).not.toHaveBeenCalled()
    expect(report).not.toHaveBeenCalled()
  })
})
