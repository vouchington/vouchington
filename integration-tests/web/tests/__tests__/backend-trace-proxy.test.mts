/**
 * Regression guard for the trace-proxy parallel-safety fix (PR #5471).
 *
 * The proxy stores requests in an **append-only** buffer keyed by `x-request-id`.
 * Two concurrent requests with different IDs must not clobber each other's bucket.
 *
 * This test is self-contained: it spins up its own stub backend and a fresh proxy
 * instance so it does not depend on the global-setup harness services.
 */
import http from 'node:http'
import { once } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTraceProxy } from '../../helpers/backend-trace-proxy.mts'
import { listenOnFetchSafeEphemeralPort } from '../../helpers/ports.mts'

function closeServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('backend-trace-proxy parallel isolation', () => {
  let stubServer: http.Server
  let proxy: Awaited<ReturnType<typeof createTraceProxy>>

  beforeAll(async () => {
    stubServer = http.createServer((_req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
    })

    const stubPort = await listenOnFetchSafeEphemeralPort(stubServer)
    const stubOrigin = `http://127.0.0.1:${stubPort}`

    proxy = await createTraceProxy(0, stubOrigin)
  })

  afterAll(async () => {
    await proxy.close()
    await new Promise<void>((resolve, reject) => {
      stubServer.close((error: Error | undefined) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })

  it('buckets concurrent requests by x-request-id without clobbering', async () => {
    const idA = 'trace-test-id-a'
    const idB = 'trace-test-id-b'

    // Fire both requests concurrently through the proxy
    await Promise.all([
      fetch(`${proxy.origin}/path-a`, { headers: { 'x-request-id': idA } }),
      fetch(`${proxy.origin}/path-b`, { headers: { 'x-request-id': idB } }),
    ])

    // Read the full append-only buffer
    const res = await fetch(`${proxy.origin}/__trace/requests`)
    const { requests } = (await res.json()) as {
      requests: Array<{ requestId: string; path: string }>
    }

    const bucketA = requests.filter(r => r.requestId === idA)
    const bucketB = requests.filter(r => r.requestId === idB)

    // Each bucket must contain exactly its own request
    expect(bucketA).toHaveLength(1)
    expect(bucketA[0]!.path).toBe('/path-a')

    expect(bucketB).toHaveLength(1)
    expect(bucketB[0]!.path).toBe('/path-b')

    // Cross-contamination check: A's bucket must not contain B's path and vice versa
    expect(bucketA.some(r => r.path === '/path-b')).toBe(false)
    expect(bucketB.some(r => r.path === '/path-a')).toBe(false)
  })

  it('returns an empty bucket for an unknown request id', async () => {
    const res = await fetch(`${proxy.origin}/__trace/requests`)
    const { requests } = (await res.json()) as { requests: Array<{ requestId: string }> }

    const bucket = requests.filter(r => r.requestId === 'does-not-exist')
    expect(bucket).toHaveLength(0)
  })

  it('forwards request and response chunks without waiting for the complete body', async () => {
    let receivedFirstRequestChunk!: () => void
    const firstRequestChunk = new Promise<void>(resolve => {
      receivedFirstRequestChunk = resolve
    })
    let releaseRequest!: () => void
    const requestReleased = new Promise<void>(resolve => {
      releaseRequest = resolve
    })
    let releaseSecondResponseChunk!: () => void
    const secondResponseChunkReleased = new Promise<void>(resolve => {
      releaseSecondResponseChunk = resolve
    })
    const streamingServer = http.createServer(async (request, response) => {
      request.once('data', () => receivedFirstRequestChunk())
      await requestReleased
      for await (const chunk of request) {
        // Consume the remaining streamed body before returning a streamed response.
        void chunk
      }
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.write('first-response-chunk')
      await secondResponseChunkReleased
      response.end('second-response-chunk')
    })
    const streamingPort = await listenOnFetchSafeEphemeralPort(streamingServer)
    const streamingProxy = await createTraceProxy(0, `http://127.0.0.1:${streamingPort}`)
    try {
      const request = http.request(`${streamingProxy.origin}/stream`, { method: 'POST' })
      const responsePromise = once(request, 'response').then(
        ([response]) => response as http.IncomingMessage,
      )
      request.write('first-request-chunk')
      await firstRequestChunk
      request.end('second-request-chunk')
      releaseRequest()

      const response = await responsePromise
      const chunks: Buffer[] = []
      let receivedFirstResponseChunk!: () => void
      const firstResponseChunk = new Promise<void>(resolve => {
        receivedFirstResponseChunk = resolve
      })
      response.on('data', chunk => {
        chunks.push(Buffer.from(chunk))
        receivedFirstResponseChunk()
      })
      const responseEnded = once(response, 'end')
      await firstResponseChunk
      expect(Buffer.concat(chunks).toString()).toBe('first-response-chunk')

      releaseSecondResponseChunk()
      await responseEnded
      expect(Buffer.concat(chunks).toString()).toBe('first-response-chunksecond-response-chunk')
    } finally {
      releaseSecondResponseChunk()
      await streamingProxy.close()
      await closeServer(streamingServer)
    }
  })

  it('removes Connection-nominated hop-by-hop headers in both directions', async () => {
    let receivedHeaders: http.IncomingHttpHeaders | undefined
    const headerServer = http.createServer((request, response) => {
      receivedHeaders = request.headers
      response.writeHead(200, {
        Connection: 'x-remove-response',
        'X-End-To-End-Response': 'preserved',
        'X-Remove-Response': 'removed',
      })
      response.end('ok')
    })
    const headerPort = await listenOnFetchSafeEphemeralPort(headerServer)
    const headerProxy = await createTraceProxy(0, `http://127.0.0.1:${headerPort}`)
    try {
      const request = http.get(headerProxy.origin, {
        headers: {
          Connection: 'x-remove-request',
          'X-End-To-End-Request': 'preserved',
          'X-Remove-Request': 'removed',
        },
      })
      const [response] = (await once(request, 'response')) as [http.IncomingMessage]
      response.resume()
      await once(response, 'end')

      expect(receivedHeaders?.['x-remove-request']).toBeUndefined()
      expect(receivedHeaders?.['x-end-to-end-request']).toBe('preserved')
      expect(response.headers['x-remove-response']).toBeUndefined()
      expect(response.headers['x-end-to-end-response']).toBe('preserved')
    } finally {
      await headerProxy.close()
      await closeServer(headerServer)
    }
  })

  it('aborts the upstream request when the client disconnects', async () => {
    let markUpstreamStarted!: () => void
    const upstreamStarted = new Promise<void>(resolve => {
      markUpstreamStarted = resolve
    })
    let markUpstreamClosed!: () => void
    const upstreamClosed = new Promise<void>(resolve => {
      markUpstreamClosed = resolve
    })
    let upstreamRequest: http.IncomingMessage | undefined
    const abortServer = http.createServer(request => {
      upstreamRequest = request
      request.once('data', markUpstreamStarted)
      request.once('aborted', markUpstreamClosed)
      request.once('close', markUpstreamClosed)
    })
    const abortPort = await listenOnFetchSafeEphemeralPort(abortServer)
    const abortProxy = await createTraceProxy(0, `http://127.0.0.1:${abortPort}`)
    const request = http.request(abortProxy.origin, { method: 'POST' })
    request.on('error', () => undefined)
    try {
      request.write(Buffer.alloc(64 * 1024))
      await upstreamStarted
      request.destroy()
      await upstreamClosed
      expect(upstreamRequest?.complete).toBe(false)
    } finally {
      request.destroy()
      await abortProxy.close()
      await closeServer(abortServer)
    }
  })

  it('terminates the client response when the upstream disconnects', async () => {
    let releaseDisconnect!: () => void
    const disconnectReleased = new Promise<void>(resolve => {
      releaseDisconnect = resolve
    })
    const disconnectServer = http.createServer(async (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.write('partial')
      await disconnectReleased
      response.socket?.destroy(new Error('upstream disconnected'))
    })
    const disconnectPort = await listenOnFetchSafeEphemeralPort(disconnectServer)
    const disconnectProxy = await createTraceProxy(0, `http://127.0.0.1:${disconnectPort}`)
    try {
      const outcome = await new Promise<'aborted' | 'end' | 'error'>(resolve => {
        const request = http.get(disconnectProxy.origin)
        request.once('error', () => resolve('error'))
        request.once('response', response => {
          response.once('data', () => releaseDisconnect())
          response.resume()
          response.once('aborted', () => resolve('aborted'))
          response.once('error', () => resolve('error'))
          response.once('end', () => resolve('end'))
        })
      })
      expect(outcome).not.toBe('end')
    } finally {
      releaseDisconnect()
      await disconnectProxy.close()
      await closeServer(disconnectServer)
    }
  })
})
