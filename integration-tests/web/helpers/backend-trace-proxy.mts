import http from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createAssetConcurrencyBroker } from './concurrency-broker.mts'
import { isFetchSafePort, listenOnFetchSafeEphemeralPort } from './ports.mts'

export interface TracedRequest {
  method: string
  path: string
  status: number
  durationMs: number
  cookieHeader: string | null
  userAgent: string | null
  requestId: string | null
}

export interface TraceProxyHandle {
  origin: string
  close: () => Promise<void>
}

const TRACE_REQUESTS_PATH = '/__trace/requests'
const TRACE_HEALTH_PATH = '/__trace/health'

export async function createTraceProxy(
  port: number,
  targetOrigin: string,
): Promise<TraceProxyHandle> {
  if (port !== 0 && !isFetchSafePort(port)) {
    throw new Error(`Trace proxy port ${String(port)} is forbidden by Fetch`)
  }

  // Intentionally append-only and unbounded: this proxy is test-scoped (process exits after the suite),
  // and request-id bucketing makes per-test isolation safe without eviction.
  const tracedRequests: TracedRequest[] = []
  const assetConcurrencyBroker = createAssetConcurrencyBroker(6)

  const server = http.createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url ?? '/', `http://127.0.0.1:${port}`)

    if (assetConcurrencyBroker.handle(url.pathname, outgoing)) return

    if (url.pathname === TRACE_HEALTH_PATH) {
      outgoing.writeHead(200, { 'Content-Type': 'application/json' })
      outgoing.end(JSON.stringify({ ok: true }))
      return
    }

    if (url.pathname === TRACE_REQUESTS_PATH) {
      outgoing.writeHead(200, { 'Content-Type': 'application/json' })
      outgoing.end(JSON.stringify({ requests: tracedRequests }))
      return
    }

    const startedAt = Date.now()
    const requestUrl = new URL(url.pathname + url.search, targetOrigin)
    const headers = new Headers()

    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) {
        headers.set(key, value.join(', '))
      } else if (value !== undefined) {
        headers.set(key, value)
      }
    }

    stripHopByHopHeaders(headers)
    if (!headers.has('host')) {
      headers.set('host', requestUrl.host)
    }
    headers.set('accept-encoding', 'identity')
    headers.delete('content-length')

    const abortController = new AbortController()
    const abort = (): void => abortController.abort()
    incoming.once('aborted', abort)
    outgoing.once('close', abort)

    let response: Response
    try {
      const requestInit: RequestInit & { duplex: 'half' } = {
        method: incoming.method,
        headers,
        body: shouldSendBody(incoming.method)
          ? (Readable.toWeb(incoming) as unknown as globalThis.ReadableStream<Uint8Array>)
          : undefined,
        // Node requires duplex for a streaming request body; this keeps upstream
        // backpressure coupled to the caller instead of assembling a Buffer first.
        duplex: 'half',
        signal: abortController.signal,
      }
      response = await fetch(requestUrl, requestInit)
    } catch (error) {
      if (abortController.signal.aborted || outgoing.destroyed || outgoing.writableEnded) {
        incoming.off('aborted', abort)
        outgoing.off('close', abort)
        return
      }
      outgoing.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      outgoing.end(
        `Trace proxy failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
      incoming.off('aborted', abort)
      outgoing.off('close', abort)
      return
    }

    tracedRequests.push({
      method: incoming.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      status: response.status,
      durationMs: Date.now() - startedAt,
      cookieHeader: headers.get('cookie'),
      userAgent: headers.get('user-agent'),
      requestId: headers.get('x-request-id'),
    })

    const responseHeaders = new Headers(response.headers)
    stripHopByHopHeaders(responseHeaders)
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('content-length')

    outgoing.writeHead(response.status, Object.fromEntries(responseHeaders.entries()))
    try {
      if (response.body)
        await pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>), outgoing)
      else outgoing.end()
    } catch (error) {
      if (!abortController.signal.aborted) outgoing.destroy(error as Error)
    } finally {
      incoming.off('aborted', abort)
      outgoing.off('close', abort)
    }
  })

  const boundPort =
    port === 0
      ? await listenOnFetchSafeEphemeralPort(server)
      : await listenOnExactLoopbackPort(server, port)

  return {
    origin: `http://127.0.0.1:${boundPort}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      }),
  }
}

async function listenOnExactLoopbackPort(server: http.Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  return port
}

function shouldSendBody(method: string | undefined): boolean {
  return !(method === 'GET' || method === 'HEAD' || method === undefined)
}

function stripHopByHopHeaders(headers: Headers): void {
  const connectionTokens = (headers.get('connection') ?? '')
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
  for (const name of [
    ...connectionTokens,
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    headers.delete(name)
  }
}
