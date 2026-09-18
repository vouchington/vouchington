import http, { type RequestListener } from 'node:http'
import {
  EphemeralListenerAttemptsExhaustedError,
  listenOnEphemeralPort,
} from '@ts-shared/utils/ephemeral-ports'
import {
  isFetchForbiddenPort as isFetchForbiddenTestPort,
  isFetchSafePort,
} from '@ts-shared/utils/fetch-ports'

const DEFAULT_HOST = '127.0.0.1'

export type FetchSafeTestServer = {
  server: http.Server
  port: number
  origin: string
  url(path: string): string
  close(): Promise<void>
}

type CreateFetchSafeTestServerOptions = {
  host?: string
  maxBindAttempts?: number
}

export { isFetchForbiddenTestPort }

export async function createFetchSafeTestServer(
  listener: RequestListener,
  options: CreateFetchSafeTestServerOptions = {},
): Promise<FetchSafeTestServer> {
  const host = options.host ?? DEFAULT_HOST
  const maxBindAttempts = options.maxBindAttempts
  if (maxBindAttempts !== undefined && maxBindAttempts <= 0) {
    throw new Error(`failed to bind a fetch-safe test server after ${maxBindAttempts} attempts`)
  }
  const server = http.createServer(listener)
  let port: number
  try {
    port = await listenOnEphemeralPort(server, host, {
      isAllowedPort: isFetchSafePort,
      maxBindAttempts,
    })
  } catch (error) {
    if (error instanceof EphemeralListenerAttemptsExhaustedError) {
      throw new Error(
        `failed to bind a fetch-safe test server after ${error.maxBindAttempts} attempts`,
        { cause: error },
      )
    }
    throw error
  }
  return createFetchSafeServerHandle(server, host, port)
}

function createFetchSafeServerHandle(
  server: http.Server,
  host: string,
  port: number,
): FetchSafeTestServer {
  const origin = `http://${formatHostForOrigin(host)}:${port}`
  return {
    server,
    port,
    origin,
    url: path => `${origin}${path.startsWith('/') ? path : `/${path}`}`,
    close: () => closeServer(server),
  }
}

function formatHostForOrigin(host: string): string {
  return host.includes(':') ? `[${host}]` : host
}

async function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}
