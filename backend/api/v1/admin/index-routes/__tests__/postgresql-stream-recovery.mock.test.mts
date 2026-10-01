import { beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

vi.mock<typeof import('node:fs/promises')>(import('node:fs/promises'), async importOriginal =>
  importOriginal(),
)

const TICKER_INTERVAL_MS = 30_000
const MIGRATIONS_DIRECTORY = path.resolve(
  import.meta.dirname,
  '../../../../../data-stores/psql/migrations',
)

let admin: PrivateUser

describe('PostgreSQL SSE stream recovery', () => {
  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    await import('../postgresql-stream-get.mts')
  })

  it('publishes a migration-status error when a periodic filesystem read fails', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const originalReaddir = fs.readdir
    let failNextMigrationRead = false
    const readdirSpy = vi.spyOn(fs, 'readdir').mockImplementation(async (...args) => {
      if (failNextMigrationRead && path.resolve(String(args[0])) === MIGRATIONS_DIRECTORY) {
        failNextMigrationRead = false
        throw new Error('Migration directory read failed')
      }
      return originalReaddir(...args)
    })
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval
    let tickerHandle: ReturnType<typeof setInterval> | undefined
    let tickerCallback: (() => void) | undefined
    let tickerStopped = false
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((...args) => {
      const handle = originalSetInterval(...args)
      if (args[1] === TICKER_INTERVAL_MS) {
        tickerHandle = handle
        tickerCallback = () => args[0]()
      }
      return handle
    })
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(handle => {
      originalClearInterval(handle)
      if (handle === tickerHandle) tickerStopped = true
    })
    const chunks: string[] = []
    let contentType = ''
    let responseToDestroy: { destroy: () => void } | undefined
    let tickerTriggered = false

    try {
      await new Promise<void>((resolve, reject) => {
        const req = request
          .get('/api/v1/admin/postgresql/stream')
          .set('Accept', 'text/event-stream')
          .timeout(5000)
          .buffer(false)

        req.on(
          'response',
          (res: {
            headers: Record<string, string>
            on: (event: string, fn: (...args: unknown[]) => void) => void
            destroy: () => void
          }) => {
            responseToDestroy = res
            contentType = res.headers['content-type'] ?? ''
            res.on('data', (...args: unknown[]) => {
              chunks.push(String(args[0]))
              const snapshotCount = chunks.join('').match(/event: snapshot\n/g)?.length ?? 0
              if (snapshotCount >= 2) {
                res.destroy()
                resolve()
              } else if (snapshotCount === 1 && !tickerTriggered) {
                if (!tickerCallback) {
                  reject(new Error('The PostgreSQL snapshot ticker was not registered'))
                  res.destroy()
                  return
                }
                tickerTriggered = true
                failNextMigrationRead = true
                tickerCallback()
              }
            })
            res.on('error', () => resolve())
          },
        )

        req.on('error', (err: Error) => {
          if (contentType || chunks.length > 0) resolve()
          else reject(err)
        })
        req.catch(() => {
          if (contentType || chunks.length > 0) resolve()
        })
      })

      expect(contentType).toContain('text/event-stream')
      expect(chunks.join('').match(/event: snapshot\n/g)).toHaveLength(2)
      expect(chunks.join('')).toContain('Migration directory read failed')
      if (!tickerHandle) throw new Error('The PostgreSQL snapshot ticker was not registered')
    } finally {
      try {
        responseToDestroy?.destroy()
        if (tickerHandle) {
          await vi.waitFor(
            () => {
              if (!tickerStopped) throw new Error('The PostgreSQL snapshot ticker did not stop')
            },
            { timeout: 10_000 },
          )
        }
      } finally {
        readdirSpy.mockRestore()
        setIntervalSpy.mockRestore()
        clearIntervalSpy.mockRestore()
      }
    }
  })
})
