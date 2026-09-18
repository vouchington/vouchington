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

const servers: ReturnType<typeof createServer>[] = []

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await listenOnEphemeralPort(server, '127.0.0.1')
  return backendLocalizationUrl((server.address() as AddressInfo).port.toString())
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
