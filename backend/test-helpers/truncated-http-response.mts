import { createServer } from 'node:http'
import type { Socket } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'
import type { getExternalFetch } from '@modules/utils'

/** Return real response headers before terminating an owned HTTP socket during body consumption. */
export async function withTruncatedHttpResponseForTest<Result>(
  expectedUrl: string,
  operation: (
    transport: ReturnType<typeof getExternalFetch>,
    requestCount: () => number,
  ) => Promise<Result>,
): Promise<Result> {
  const responseSockets: Socket[] = []
  let requests = 0
  const server = createServer((_request, response) => {
    requests += 1
    if (!response.socket) throw new Error('Owned HTTP response has no socket')
    responseSockets.push(response.socket)
    response.writeHead(200, { 'content-type': 'text/plain', 'content-length': '100' })
    response.flushHeaders()
    response.write('User-agent: *\n')
  })
  const dispatcher = new Agent({ connections: 1 })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Owned HTTP server did not bind a port')
    const transport: ReturnType<typeof getExternalFetch> = async (input, init) => {
      if (typeof input !== 'string' || input !== expectedUrl)
        throw new Error('Unexpected URL for owned HTTP transport')
      const response = await undiciFetch(`http://127.0.0.1:${address.port}/robots.txt`, {
        ...(init as Parameters<typeof undiciFetch>[1]),
        dispatcher,
      })
      const socket = responseSockets.shift()
      if (!socket) throw new Error('Owned HTTP response socket was not captured')
      socket.destroy()
      return response as unknown as Response
    }
    return await operation(transport, () => requests)
  } finally {
    for (const socket of responseSockets) socket.destroy()
    await dispatcher.close()
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  }
}
