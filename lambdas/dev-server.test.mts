import { execFile as execFileCallback } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { listenOnEphemeralPort } from '../ts-shared/utils/ephemeral-ports.mts'

import { listen, server } from './dev-server.mts'
import { PLAYWRIGHT_PODCAST_COVER_URL } from './playwright-podcast-cover.mts'

const execFile = promisify(execFileCallback)

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
    const port = await listenOnEphemeralPort(server, '127.0.0.1')
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

describe('listen', () => {
  it('prints the requested port in the banner once bound', async () => {
    const target = http.createServer()
    const logSpy = vi.spyOn(console, 'log').mockReturnValue(undefined)
    try {
      listen(target, 0)
      await once(target, 'listening')

      expect(logSpy).toHaveBeenCalledWith('Lambda dev server: http://localhost:0')
    } finally {
      logSpy.mockRestore()
      target.close()
    }
  })

  // The image-lambda smoke test reallocates a port only when the dev server exits and its log
  // contains EADDRINUSE, so a bind collision must crash the real entry point with that text.
  it(
    'exits non-zero with EADDRINUSE when its port is already bound',
    { timeout: 20_000 },
    async () => {
      const blocker = http.createServer()
      blocker.listen(0)
      await once(blocker, 'listening')
      const { port } = blocker.address() as AddressInfo
      try {
        await expect(
          execFile(process.execPath, [fileURLToPath(new URL('dev-server.mts', import.meta.url))], {
            env: { ...process.env, IMAGE_LAMBDA_PORT: String(port) },
            timeout: 15_000,
          }),
        ).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/EADDRINUSE/) })
      } finally {
        blocker.close()
      }
    },
  )
})
