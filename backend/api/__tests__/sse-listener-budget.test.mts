import { createServer, request as httpRequest } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import { createVouchaApiApp } from '../app.mts'
import { startSSE } from '../sse-helpers.mts'

describe('SSE response listener budget', () => {
  it('keeps composed close listeners within the dynamically reserved limit', async () => {
    const app = createVouchaApiApp()
    const listenerState = Promise.withResolvers<{ count: number; limit: number }>()
    app.route('/events').get(async ctx => {
      const { stream, pipelinePromise } = startSSE(ctx)
      listenerState.resolve({
        count: ctx.res.listenerCount('close'),
        limit: ctx.res.getMaxListeners(),
      })
      stream.end('event: done\ndata: {}\n\n')
      await pipelinePromise
    })

    const callback = app.callback()
    const closeObserver = vi.fn<() => void>()
    let response: Context['res'] | undefined
    const server = createServer((req, res) => {
      response = res
      res.once('close', closeObserver)
      res.once('close', closeObserver)
      res.once('close', closeObserver)
      callback(req, res)
    })
    const port = await listenOnEphemeralPort(server, '127.0.0.1')

    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest({ hostname: '127.0.0.1', port, path: '/events' }, res => {
          res.resume()
          res.once('end', resolve)
        })
        req.once('error', reject)
        req.end()
      })

      await expect(listenerState.promise).resolves.toEqual({ count: 11, limit: 11 })
      await vi.waitFor(() => {
        expect(response?.getMaxListeners()).toBe(10)
        expect(response?.listenerCount('close')).toBeLessThanOrEqual(
          response?.getMaxListeners() ?? 0,
        )
        expect(closeObserver).toHaveBeenCalledTimes(3)
      })
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
})
