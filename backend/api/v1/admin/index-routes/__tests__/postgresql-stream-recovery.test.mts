import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createMigrationStatusFixture } from '@voucha/test-helpers/migration-status-fixture'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const TICKER_INTERVAL_MS = 30_000
let admin: PrivateUser

describe('PostgreSQL SSE stream recovery', () => {
  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    await import('../postgresql-stream-get.mts')
  })

  it('publishes a migration-status error when a periodic filesystem read fails', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const migrationFixture = await createMigrationStatusFixture()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const tickerStopped = Promise.withResolvers<void>()
    const clearFakeInterval = globalThis.clearInterval
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(handle => {
      clearFakeInterval(handle)
      tickerStopped.resolve()
    })
    const chunks: string[] = []
    let contentType = ''
    let responseToDestroy: { destroy: () => void } | undefined
    let advanced = false

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
                return
              }
              if (snapshotCount === 1 && !advanced) {
                advanced = true
                migrationFixture.failNextRead(new Error('Migration directory read failed'))
                void vi.advanceTimersByTimeAsync(TICKER_INTERVAL_MS).catch(reject)
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
      await tickerStopped.promise
    } finally {
      try {
        responseToDestroy?.destroy()
      } finally {
        clearIntervalSpy.mockRestore()
        // Drain retained restorers before restoring real timer globals.
        vi.restoreAllMocks()
        vi.useRealTimers()
      }
    }
  })
})
