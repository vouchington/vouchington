import { once } from 'node:events'
import {
  createServer,
  request as createRequest,
  type Agent,
  type IncomingHttpHeaders,
  type RequestListener,
  type Server,
} from 'node:http'
import { createConnection, type AddressInfo, type Socket } from 'node:net'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'

const NETWORK_TIMEOUT_MS = 5000

export interface HttpResult {
  statusCode: number | undefined
  headers: IncomingHttpHeaders
  body: string
  socket: Socket
}

export async function listen(listener: RequestListener): Promise<Server> {
  const server = createServer(listener)
  await startListening(server)
  return server
}

export async function startListening(server: Server): Promise<void> {
  try {
    await listenOnEphemeralPort(server, '127.0.0.1')
  } catch (error) {
    server.closeAllConnections()
    if (server.listening) server.close()
    throw error
  }
}

export async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  const closed = once(server, 'close', { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
  server.close()
  await closed
}

export async function sendRawRequest(server: Server, requestText: string): Promise<string> {
  const { port } = server.address() as AddressInfo
  const signal = AbortSignal.timeout(NETWORK_TIMEOUT_MS)
  const socket = createConnection(port, '127.0.0.1')
  let response = ''
  socket.setEncoding('utf8')
  socket.on('data', chunk => {
    response += chunk
  })

  try {
    await once(socket, 'connect', { signal })
    socket.end(requestText)
    await once(socket, 'end', { signal })
    return response
  } finally {
    socket.destroy()
  }
}

export function sendHttpRequest(
  server: Server,
  options: { method: string; path: string; headers?: IncomingHttpHeaders },
  chunks: readonly Buffer[] = [],
  agent?: Agent,
): Promise<HttpResult> {
  const { port } = server.address() as AddressInfo
  return new Promise((resolve, reject) => {
    const request = createRequest({
      host: '127.0.0.1',
      port,
      agent,
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      ...options,
    })
    request.once('response', response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        body += chunk
      })
      response.once('aborted', () => reject(new Error('HTTP response aborted')))
      response.once('error', reject)
      response.once('end', () => {
        const socket = request.socket
        if (!socket) {
          reject(new Error('HTTP request did not receive a socket'))
          return
        }
        resolve({ statusCode: response.statusCode, headers: response.headers, body, socket })
      })
    })
    request.once('error', reject)
    try {
      for (const chunk of chunks) request.write(chunk)
      request.end()
    } catch (error) {
      request.destroy()
      reject(error)
    }
  })
}

export function sendExpectedBody(
  server: Server,
  body: Buffer,
): Promise<Pick<HttpResult, 'statusCode'> & { continued: boolean }> {
  const { port } = server.address() as AddressInfo
  return new Promise((resolve, reject) => {
    let continued = false
    const request = createRequest(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/body',
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.length),
          expect: '100-continue',
        },
      },
      response => {
        response.resume()
        response.once('aborted', () => reject(new Error('Expected-body response aborted')))
        response.once('error', reject)
        response.once('end', () => resolve({ statusCode: response.statusCode, continued }))
      },
    )
    request.once('continue', () => {
      continued = true
      request.end(body)
    })
    request.once('error', reject)
    try {
      request.flushHeaders()
    } catch (error) {
      request.destroy()
      reject(error)
    }
  })
}
