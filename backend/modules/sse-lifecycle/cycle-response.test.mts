import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SSE_CYCLE_DURATION_MS,
  MAX_SSE_CYCLE_DURATION_MS,
  armDashboardEventStream,
} from './index.mts'

class OpenResponse extends EventEmitter {
  destroyed = false
  writableEnded = false
  endCount = 0

  end(): this {
    this.endCount += 1
    this.writableEnded = true
    this.emit('finish')
    this.emit('close')
    return this
  }
}

function openResponse(): OpenResponse {
  return new OpenResponse()
}

describe('armDashboardEventStream', () => {
  it('ends the dashboard event stream at the shared cycle without a named event', async () => {
    vi.useFakeTimers()
    const response = openResponse()
    let cleanedUp = false
    response.on('close', () => {
      cleanedUp = true
    })

    try {
      armDashboardEventStream({ method: 'GET', url: '/api/events?cursor=1' }, response)

      await vi.advanceTimersByTimeAsync(DEFAULT_SSE_CYCLE_DURATION_MS - 1)
      expect(response.writableEnded).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      expect(response.endCount).toBe(1)
      expect(response.writableEnded).toBe(true)
      expect(cleanedUp).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves other dashboard routes open past the cycle', async () => {
    vi.useFakeTimers()
    const response = openResponse()

    try {
      armDashboardEventStream({ method: 'GET', url: '/api/queues' }, response)
      armDashboardEventStream({ method: 'POST', url: '/api/events' }, response)
      armDashboardEventStream(
        { method: 'GET', url: '/api/queues/background/jobs/job-1/stream?lastId=0-0' },
        response,
      )

      await vi.advanceTimersByTimeAsync(MAX_SSE_CYCLE_DURATION_MS)
      expect(response.endCount).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not end a stream the client already closed', async () => {
    vi.useFakeTimers()
    const response = openResponse()

    try {
      armDashboardEventStream({ method: 'GET', url: '/api/events' }, response)
      response.emit('close')

      await vi.advanceTimersByTimeAsync(DEFAULT_SSE_CYCLE_DURATION_MS)
      expect(response.endCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a cycle above the shared maximum before arming a timer', () => {
    vi.useFakeTimers()
    const response = openResponse()

    try {
      expect(() =>
        armDashboardEventStream(
          { method: 'GET', url: '/api/events' },
          response,
          MAX_SSE_CYCLE_DURATION_MS + 1,
        ),
      ).toThrow(RangeError)
      expect(vi.getTimerCount()).toBe(0)
      expect(response.endCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ends a live event-stream response so request-close cleanup can run', async () => {
    const requestClosed = Promise.withResolvers<void>()
    const server = createServer((req, res) => {
      armDashboardEventStream(req, res, 15)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      res.write(': heartbeat\n\n')
      req.on('close', () => requestClosed.resolve())
    })
    const port = await new Promise<number>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('missing port'))
      })
    })

    try {
      const body = await new Promise<string>((resolve, reject) => {
        const req = httpRequest({ hostname: '127.0.0.1', port, path: '/api/events' }, response => {
          const chunks: Buffer[] = []
          response.on('data', chunk => chunks.push(Buffer.from(chunk)))
          response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
          response.on('error', reject)
        })
        req.on('error', reject)
        req.end()
      })
      await requestClosed.promise
      expect(body).toBe(': heartbeat\n\n')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('cycles the served GlideMQ dashboard event route through the shared helper', () => {
    const source = readFileSync('backend/entrypoints/api/glidemq-dashboard.mts', 'utf8')
    expect(source).toContain("from '@modules/sse-lifecycle'")
    expect(source).toMatch(/armDashboardEventStream\(req, res\)[\s\S]*createDashboard\(/)
  })
})
