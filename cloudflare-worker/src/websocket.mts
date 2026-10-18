import {
  buildOriginRequest,
  edgeErrorResponse,
  NEXTJS_INTERNAL_HEADERS_TO_STRIP,
} from '@vouchington/edge'
import { isProductionMode } from './production-mode.mts'
import type { Env } from './types.mts'
import { REQUEST_KIND_HEADER } from './client-info.mts'
import { stripStagingControlHeaders } from './staging-control-headers.mts'

export const DEV_HMR_WEBSOCKET_PATH = '/_next/hmr'
const NO_STRIP_COOKIES = new Set<string>()
const LOCAL_WEBSOCKET_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export const isDevHmrWebSocketProxyAllowed = (env: Env): boolean => {
  if (isProductionMode(env) || env.DEV_WEBSOCKET_PROXY !== 'true') {
    return false
  }

  if (!env.WEB_ORIGIN) {
    return false
  }

  try {
    const origin = new URL(env.WEB_ORIGIN)
    return (
      (origin.protocol === 'http:' || origin.protocol === 'https:') &&
      LOCAL_WEBSOCKET_ORIGIN_HOSTS.has(origin.hostname)
    )
  } catch {
    return false
  }
}

// Cloudflare Workers-specific APIs not present in the standard webworker lib
declare class WebSocketPair {
  readonly 0: WebSocket
  readonly 1: WebSocket
}

declare global {
  interface WebSocket {
    accept(): void
  }
  interface Response {
    readonly webSocket: WebSocket | null
  }
  interface ResponseInit {
    webSocket?: WebSocket
  }
}

export const handleWebSocket = async (request: Request, url: URL, env: Env): Promise<Response> => {
  if (url.pathname !== DEV_HMR_WEBSOCKET_PATH || !isDevHmrWebSocketProxyAllowed(env)) {
    return edgeErrorResponse(
      400,
      'WebSocket proxy is disabled outside local development HMR',
      'INVALID_INPUT',
    )
  }

  const requestId = crypto.randomUUID()
  const appHeaders = new Headers(request.headers)
  stripStagingControlHeaders(appHeaders)
  appHeaders.delete('x-user-id')
  appHeaders.delete('x-device-token')
  appHeaders.delete('x-session-token')
  appHeaders.delete('x-voucha-gpc')
  appHeaders.delete(REQUEST_KIND_HEADER)
  if (request.headers.get('sec-gpc') === '1') appHeaders.set('x-voucha-gpc', '1')
  const originRequest = buildOriginRequest(new Request(request, { headers: appHeaders }), {
    origin: env.WEB_ORIGIN ?? '',
    stripCookieNames: NO_STRIP_COOKIES,
    requestId,
    sharedSecret: { header: 'x-cf-worker-secret', value: undefined },
    stripHeaders: NEXTJS_INTERNAL_HEADERS_TO_STRIP,
  })

  let originResponse: Response
  try {
    originResponse = await fetch(originRequest)
  } catch (err) {
    console.error('WebSocket origin fetch failed:', err)
    return edgeErrorResponse(502, 'Bad Gateway', 'BAD_GATEWAY')
  }

  const originWs = originResponse.webSocket
  if (!originWs) {
    return edgeErrorResponse(502, 'WebSocket upgrade failed', 'BAD_GATEWAY')
  }

  const pair = new WebSocketPair()
  const client = pair[0]
  const server = pair[1]

  server.accept()
  originWs.accept()

  server.addEventListener('message', (e: MessageEvent) => originWs.send(e.data))
  originWs.addEventListener('message', (e: MessageEvent) => server.send(e.data))

  server.addEventListener('close', (e: CloseEvent) => {
    try {
      originWs.close(e.code, e.reason)
    } catch {
      // The peer may already be closed.
    }
  })
  originWs.addEventListener('close', (e: CloseEvent) => {
    try {
      server.close(e.code, e.reason)
    } catch {
      // The peer may already be closed.
    }
  })

  server.addEventListener('error', () => {
    try {
      originWs.close()
    } catch {
      // The peer may already be closed.
    }
  })
  originWs.addEventListener('error', () => {
    try {
      server.close()
    } catch {
      // The peer may already be closed.
    }
  })

  return new Response(null, { status: 101, webSocket: client })
}
