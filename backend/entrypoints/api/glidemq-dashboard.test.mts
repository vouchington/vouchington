import { createServer, request as httpRequest, type Server } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SSE_CYCLE_DURATION_MS } from '@modules/sse-lifecycle'
import dashboardApp from './glidemq-dashboard.mts'

async function listen(server: Server): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') resolve(address.port)
      else reject(new Error('missing port'))
    })
  })
}

describe('glidemq dashboard SSE cycle mount', () => {
  it('ends the mounted event stream on the shared cycle without a named event', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const server = createServer(dashboardApp)

    try {
      const port = await listen(server)
      const firstChunk = Promise.withResolvers<void>()
      const body = Promise.withResolvers<string>()
      const req = httpRequest({ hostname: '127.0.0.1', port, path: '/api/events' }, response => {
        expect(response.statusCode).toBe(200)
        expect(response.headers['content-type']).toContain('text/event-stream')
        const chunks: Buffer[] = []
        response.on('data', chunk => {
          chunks.push(Buffer.from(chunk))
          firstChunk.resolve()
        })
        response.on('end', () => body.resolve(Buffer.concat(chunks).toString('utf8')))
        response.on('error', body.reject)
      })
      req.on('error', body.reject)
      req.end()

      await firstChunk.promise
      await vi.advanceTimersByTimeAsync(DEFAULT_SSE_CYCLE_DURATION_MS - 1)
      await vi.advanceTimersByTimeAsync(1)
      await expect(body.promise).resolves.not.toMatch(/event:\s*error/)
    } finally {
      vi.useRealTimers()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
