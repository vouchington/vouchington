import { createServer } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { checkLocalHealth } from './local-healthcheck.mts'

describe('compiled API local health probe', () => {
  it.each([
    { response: 200, healthy: true },
    { response: 204, healthy: true },
    { response: 299, healthy: true },
    { response: 404, healthy: false },
    { response: 503, healthy: false },
    { response: 'disconnect', healthy: false },
    { response: 'never sends headers', healthy: false },
  ])('reports $healthy for $response within the ECS deadline', async ({ response, healthy }) => {
    const paths: string[] = []
    const server = createServer((request, reply) => {
      paths.push(request.url!)
      if (typeof response === 'number') reply.writeHead(response).end('pong')
      else if (response === 'disconnect') reply.destroy()
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('missing HTTP listener')
      await expect(checkLocalHealth(address.port)).resolves.toBe(healthy)
      expect(paths).toEqual(['/infra/ping'])
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()))
      })
    }
  })
})
