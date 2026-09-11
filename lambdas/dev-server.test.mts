import { EventEmitter } from 'node:events'
import http from 'node:http'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listenOnRunnerUnreservedEphemeralPort } from '../ci/runner-port-policy.mts'

import { listenWithRetry, server } from './dev-server.mts'
import { PLAYWRIGHT_PODCAST_COVER_URL } from './playwright-podcast-cover.mts'

type ListenOutcome = 'EADDRINUSE' | 'ok'

function createFakeServer(outcomes: ListenOutcome[]): { attempts: number[]; fake: http.Server } {
  const emitter = new EventEmitter()
  const attempts: number[] = []
  const fake = emitter as unknown as http.Server
  fake.listen = ((port: number, callback?: () => void) => {
    attempts.push(port)
    if (callback) {
      fake.once('listening', callback)
    }
    const outcome = outcomes.shift()
    if (outcome === 'ok') {
      emitter.emit('listening')
    } else {
      emitter.emit('error', Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }))
    }
    return fake
  }) as unknown as http.Server['listen']
  return { attempts, fake }
}

let origin: string

function request(path: string): Promise<{
  body: Buffer
  headers: http.IncomingHttpHeaders
  status: number
}> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${origin}${path}`, { headers: { accept: 'image/avif,image/webp,*/*' } })
    req.on('error', reject)
    req.on('response', response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('error', reject)
      response.on('end', () =>
        resolve({
          body: Buffer.concat(chunks),
          headers: response.headers,
          status: response.statusCode ?? 0,
        }),
      )
    })
  })
}

describe('Lambda dev server Playwright fixture', () => {
  beforeAll(async () => {
    const port = await listenOnRunnerUnreservedEphemeralPort(server, '127.0.0.1')
    origin = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })

  it('serves the reserved sideload source as a local PNG', async () => {
    const encoded = Buffer.from(PLAYWRIGHT_PODCAST_COVER_URL).toString('base64url')
    const response = await request(`/sideload/${encoded}?w=400`)

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.body.subarray(1, 4).toString('ascii')).toBe('PNG')
  })
})

describe('listenWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries an EADDRINUSE bind and succeeds once the port frees up', async () => {
    const { attempts, fake } = createFakeServer(['EADDRINUSE', 'EADDRINUSE', 'ok'])
    const logSpy = vi.spyOn(console, 'log').mockReturnValue(undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)

    listenWithRetry(fake, 4100)
    expect(attempts).toEqual([4100])
    expect(logSpy).not.toHaveBeenCalled()

    await vi.advanceTimersToNextTimerAsync()
    expect(attempts).toEqual([4100, 4100])
    expect(logSpy).not.toHaveBeenCalled()

    await vi.advanceTimersToNextTimerAsync()
    expect(attempts).toEqual([4100, 4100, 4100])
    expect(logSpy).toHaveBeenCalledTimes(4)
    expect(logSpy).toHaveBeenCalledWith('Lambda dev server: http://localhost:4100')
    expect(warnSpy).toHaveBeenCalledTimes(2)

    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  // The fake server emits 'error' synchronously inside listen(), so these two tests can
  // assert a synchronous toThrow(). A real http.Server emits 'error' asynchronously, so
  // the equivalent throw there surfaces as an uncaughtException on a later tick, not a
  // throw the caller can catch directly — see the comment on that throw in dev-server.mts.
  it('throws once the attempt budget is exhausted', () => {
    const { attempts, fake } = createFakeServer(['EADDRINUSE'])

    expect(() => listenWithRetry(fake, 4100, 1, { maxAttempts: 1 })).toThrow('EADDRINUSE')
    expect(attempts).toEqual([4100])
  })

  it('rethrows a non-EADDRINUSE bind error immediately without retrying', () => {
    const emitter = new EventEmitter()
    const fake = emitter as unknown as http.Server
    let attempts = 0
    fake.listen = (() => {
      attempts += 1
      emitter.emit('error', Object.assign(new Error('listen EACCES'), { code: 'EACCES' }))
      return fake
    }) as unknown as http.Server['listen']

    expect(() => listenWithRetry(fake, 80)).toThrow('EACCES')
    expect(attempts).toBe(1)
  })
})
