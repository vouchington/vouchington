import { createServer, type RequestListener } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { listenOnEphemeralPort } from '../../ts-shared/utils/ephemeral-ports.mts'
import {
  assertBackendLocalizationReady,
  backendLocalizationUrl,
  findReadyLocalWorkerUrl,
  isLocalWorkerReady,
} from './local-smoke.mts'
import {
  assertSsrLocalizationRevision,
  isLocalizationSsrRevisionDiagnosticEnabled,
  maybeAssertSsrLocalizationRevision,
  parseSsrLocalizationRevision,
} from './ssr-revision-diagnostic.mts'

const servers: ReturnType<typeof createServer>[] = []

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await listenOnEphemeralPort(server, '127.0.0.1')
  return backendLocalizationUrl((server.address() as AddressInfo).port.toString())
}

async function listenOrigin(handler: RequestListener): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await listenOnEphemeralPort(server, '127.0.0.1')
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

describe('localization tmux smoke readiness', () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))),
    )
  })

  it('accepts the live localization response shape without reading a catalog', async () => {
    const url = await listen((request, response) => {
      if (
        request.headers['x-cf-worker-secret'] !== 'local-test-worker-secret' ||
        request.headers['x-voucha-client'] !== 'web' ||
        request.headers['x-voucha-platform'] !== 'web' ||
        !request.headers['x-voucha-app-version'] ||
        !new URL(request.url ?? '/', 'http://localhost').searchParams.get('selectors')
      ) {
        response.writeHead(403)
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"contract":"v1","revision":"test-revision"}')
    })

    await expect(assertBackendLocalizationReady(url, 'local-test-worker-secret')).resolves.toBe(
      'test-revision',
    )
    await expect(assertBackendLocalizationReady(url, 'wrong-secret')).rejects.toThrow('HTTP 403')
  })

  it('fails when the localization backend is unavailable', async () => {
    await expect(
      assertBackendLocalizationReady('http://127.0.0.1:1/api/v1/localization'),
    ).rejects.toThrow('Localization backend is unavailable')
  })

  it('waits for the Worker landing page to return success', async () => {
    const url = await listen((request, response) => {
      response.writeHead(request.url === '/' ? 200 : 502)
      response.end()
    })
    const workerUrl = new URL(url)
    workerUrl.pathname = '/'
    workerUrl.search = ''
    await expect(isLocalWorkerReady(workerUrl.toString())).resolves.toBe(true)
    await expect(findReadyLocalWorkerUrl(workerUrl.port)).resolves.toBe(workerUrl.toString())
    workerUrl.pathname = '/not-ready'
    await expect(isLocalWorkerReady(workerUrl.toString())).resolves.toBe(false)
  })
})

describe('SSR localization revision diagnostic', () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))),
    )
  })

  it('parses the development HTML marker', () => {
    expect(
      parseSsrLocalizationRevision(
        '<html lang="en" data-localization-ssr-revision="rev-1" suppressHydrationWarning>',
      ),
    ).toBe('rev-1')
    expect(parseSsrLocalizationRevision('<html lang="en">')).toBeUndefined()
  })

  it('accepts Next HTML whose marker matches the backend revision', async () => {
    const origin = await listenOrigin((request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      if (path !== '/' && path !== '/login' && path !== '/news') {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<html data-localization-ssr-revision="rev-live"></html>`)
    })
    await expect(assertSsrLocalizationRevision('rev-live', origin)).resolves.toBeUndefined()
  })

  it('fails when SSR HTML still has the previous catalog revision', async () => {
    const origin = await listenOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<html data-localization-ssr-revision="rev-old"></html>`)
    })
    await expect(assertSsrLocalizationRevision('rev-new', origin)).rejects.toThrow(
      /rendered revision rev-old, expected rev-new; restart the nextjs tmux window/,
    )
  })

  it('fails when the SSR HTML marker is missing', async () => {
    const origin = await listenOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<html lang="en"></html>')
    })
    await expect(assertSsrLocalizationRevision('rev-live', origin)).rejects.toThrow(
      /has no data-localization-ssr-revision/,
    )
  })

  it('fails when Next.js SSR is unavailable', async () => {
    await expect(assertSsrLocalizationRevision('rev-live', 'http://127.0.0.1:1')).rejects.toThrow(
      'Next.js SSR localization diagnostic is unavailable',
    )
  })

  it('fails when Next.js SSR returns an error status', async () => {
    const origin = await listenOrigin((_request, response) => {
      response.writeHead(503)
      response.end()
    })
    await expect(assertSsrLocalizationRevision('rev-live', origin)).rejects.toThrow('HTTP 503')
  })

  it('rejects a non-local Next origin', async () => {
    await expect(
      assertSsrLocalizationRevision('rev-live', 'https://example.test:3001'),
    ).rejects.toThrow('must target the local Next.js origin')
  })

  it('is disabled unless LOCALIZATION_SSR_REVISION_DIAGNOSTIC is 1', () => {
    expect(isLocalizationSsrRevisionDiagnosticEnabled({})).toBe(false)
    expect(
      isLocalizationSsrRevisionDiagnosticEnabled({ LOCALIZATION_SSR_REVISION_DIAGNOSTIC: 'true' }),
    ).toBe(false)
    expect(
      isLocalizationSsrRevisionDiagnosticEnabled({ LOCALIZATION_SSR_REVISION_DIAGNOSTIC: '1' }),
    ).toBe(true)
  })

  it('skips the Next-origin fetch when the diagnostic is disabled', async () => {
    await expect(maybeAssertSsrLocalizationRevision('rev-live', {})).resolves.toBeUndefined()
  })

  it('requires NEXT_PORT when the diagnostic is enabled', async () => {
    await expect(
      maybeAssertSsrLocalizationRevision('rev-live', {
        LOCALIZATION_SSR_REVISION_DIAGNOSTIC: '1',
      }),
    ).rejects.toThrow('NEXT_PORT is required; run ./dev/initialize web first')
  })

  it('fetches Next origin when the diagnostic is enabled', async () => {
    const origin = await listenOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<html data-localization-ssr-revision="rev-live"></html>')
    })
    const port = new URL(origin).port
    await expect(
      maybeAssertSsrLocalizationRevision('rev-live', {
        LOCALIZATION_SSR_REVISION_DIAGNOSTIC: '1',
        NEXT_PORT: port,
      }),
    ).resolves.toBeUndefined()
  })
})
