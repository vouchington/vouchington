import { createServer, request as httpRequest } from 'node:http'
import { describe, it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import {
  DEFAULT_SSE_CYCLE_DURATION_MS,
  MAX_SSE_CYCLE_DURATION_MS,
  startSSE,
} from '../sse-helpers.mts'
import { createVouchaApiApp } from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'

function makeCtx(overrides?: Partial<Context>): Context {
  const socket = { setNoDelay: vi.fn<() => void>() }
  const res = {
    on: vi.fn<VitestLooseMock>(),
    writableEnded: false,
    socket,
  }
  return {
    setType: vi.fn<VitestLooseMock>(),
    set: vi.fn<VitestLooseMock>(),
    pipeline: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    res,
    signal: new AbortController().signal,
    ...overrides,
  } as unknown as Context
}

describe('startSSE', () => {
  it('uses the 60 second default cycle and cleanly ends the stream', async () => {
    vi.useFakeTimers()
    const pipeline = Promise.withResolvers<void>()
    const result = startSSE(
      makeCtx({ pipeline: vi.fn<() => Promise<void>>().mockReturnValue(pipeline.promise) }),
    )

    await vi.advanceTimersByTimeAsync(DEFAULT_SSE_CYCLE_DURATION_MS)

    expect(result.lifecycleSignal.aborted).toBe(true)
    expect(result.lifecycleSignal.reason).toBe(CHAT_SSE_CYCLE_EXPIRED)
    expect(result.stream.writableEnded).toBe(true)
    pipeline.resolve()
    await result.pipelinePromise
    vi.useRealTimers()
  })

  it('allows the 120 second maximum cycle', () => {
    const result = startSSE(makeCtx(), { cycleDurationMs: MAX_SSE_CYCLE_DURATION_MS })
    expect(result.lifecycleSignal).toBeInstanceOf(AbortSignal)
  })

  it('rejects a cycle above the 120 second maximum', () => {
    expect(() => startSSE(makeCtx(), { cycleDurationMs: MAX_SSE_CYCLE_DURATION_MS + 1 })).toThrow(
      RangeError,
    )
  })

  it('aborts the lifecycle signal when the client disconnects', () => {
    const client = new AbortController()
    const result = startSSE(makeCtx({ signal: client.signal }))
    client.abort()
    expect(result.lifecycleSignal.aborted).toBe(true)
    expect(result.lifecycleSignal.reason).not.toBe(CHAT_SSE_CYCLE_EXPIRED)
  })

  it('does not schedule a cycle timer when the client is already disconnected', async () => {
    vi.useFakeTimers()
    const client = new AbortController()
    client.abort()

    try {
      const result = startSSE(makeCtx({ signal: client.signal }))

      expect(result.lifecycleSignal.aborted).toBe(true)
      expect(result.stream.writableEnded).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      await result.pipelinePromise
    } finally {
      vi.useRealTimers()
    }
  })

  it('disposes cycle and disconnect listeners after the pipeline settles', async () => {
    const client = new AbortController()
    const removeSpy = vi.spyOn(client.signal, 'removeEventListener')
    const result = startSSE(makeCtx({ signal: client.signal }))
    await result.pipelinePromise
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('keeps ctx.signal active after consuming a POST body and aborts it on disconnect', async () => {
    const app = createVouchaApiApp()
    const observed = Promise.withResolvers<{ afterBody: boolean; afterDisconnect: boolean }>()
    app.route('/events').post(async ctx => {
      await ctx.request.json('1kb')
      const afterBody = ctx.signal.aborted
      const { stream, pipelinePromise } = startSSE(ctx)
      stream.write('event: ready\ndata: {}\n\n')
      await new Promise<void>(resolve => ctx.signal.addEventListener('abort', () => resolve()))
      observed.resolve({ afterBody, afterDisconnect: ctx.signal.aborted })
      stream.end()
      await pipelinePromise
    })

    const server = createServer(app.callback())
    const port = await listenOnEphemeralPort(server, '127.0.0.1')

    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: '127.0.0.1',
            port,
            path: '/events',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
          },
          response => {
            response.once('data', () => {
              response.destroy()
              resolve()
            })
          },
        )
        req.once('error', reject)
        req.end('{"ok":true}')
      })

      await expect(observed.promise).resolves.toEqual({
        afterBody: false,
        afterDisconnect: true,
      })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })

  it('does not abort ctx.signal after a normally completed response', async () => {
    const app = createVouchaApiApp()
    let requestSignal: AbortSignal | undefined
    app.route('/complete').get(ctx => {
      requestSignal = ctx.signal
      ctx.json({ ok: true })
    })

    const server = createServer(app.callback())
    const port = await listenOnEphemeralPort(server, '127.0.0.1')

    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest({ hostname: '127.0.0.1', port, path: '/complete' }, response => {
          response.resume()
          response.once('end', resolve)
        })
        req.once('error', reject)
        req.end()
      })
      expect(requestSignal?.aborted).toBe(false)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })

  it('does not install its own response close listener', () => {
    const ctx = makeCtx()
    startSSE(ctx)
    expect(ctx.res.on).not.toHaveBeenCalled()
  })

  it('sets SSE headers on the context', () => {
    const ctx = makeCtx()
    startSSE(ctx)
    expect(ctx.setType).toHaveBeenCalledWith('text/event-stream')
    expect(ctx.set).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    expect(ctx.set).toHaveBeenCalledWith('Connection', 'keep-alive')
    expect(ctx.set).toHaveBeenCalledWith('X-Accel-Buffering', 'no')
  })

  it('pipelinePromise resolves on ECONNRESET disconnects without reporting', async () => {
    const error = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' })
    const ctx = makeCtx({
      pipeline: vi.fn<() => Promise<void>>().mockRejectedValue(error),
    })

    await expect(startSSE(ctx).pipelinePromise).resolves.toBeUndefined()
  })

  it('pipelinePromise resolves on ERR_STREAM_PREMATURE_CLOSE disconnects without reporting', async () => {
    const error = Object.assign(new Error('stream closed early'), {
      code: 'ERR_STREAM_PREMATURE_CLOSE',
    })
    const ctx = makeCtx({
      pipeline: vi.fn<() => Promise<void>>().mockRejectedValue(error),
    })

    await expect(startSSE(ctx).pipelinePromise).resolves.toBeUndefined()
  })

  it('pipelinePromise reports non-disconnect errors without rethrowing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')
    const error = new Error('write failed')
    const ctx = makeCtx({
      pipeline: vi.fn<() => Promise<void>>().mockRejectedValue(error),
    })

    try {
      await expect(startSSE(ctx).pipelinePromise).resolves.toBeUndefined()
      expect(consoleSpy).toHaveBeenCalledWith(error)
    } finally {
      vi.unstubAllEnvs()
      consoleSpy.mockRestore()
    }
  })

  it('returns a PassThrough stream and pipelinePromise', () => {
    const ctx = makeCtx()
    const result = startSSE(ctx)
    expect(result.stream).toBeInstanceOf(PassThrough)
    expect(result.pipelinePromise).toBeInstanceOf(Promise)
    expect(ctx.pipeline).toHaveBeenCalledWith(result.stream)
  })
})
