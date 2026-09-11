import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { createImportBatch } from '@services/admin-imports/create-batch'
import { updateRowCompleted } from '@services/admin-imports/update-row-status'
import { submitRssFeedImport } from '@services/user-import-export/rss-feed-imports'
import { updateRssFeedImportRowCompleted } from '@services/user-import-export/rss-feed-import-row-updates'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/imports/:batchId/stream', () => {
  let user: PrivateUser
  let otherUser: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    ;[user, otherUser, admin] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/imports/01900000-0000-7000-0000-000000000001/stream').expect(401)
  })

  it('returns 404 for invalid UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/imports/not-a-uuid/stream').expect(422)
  })

  it('returns 404 for nonexistent batchId', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/imports/01900000-0000-7000-0000-000000000001/stream').expect(404)
  })

  it('returns 404 for nonexistent batchId when authenticated as admin', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/imports/01900000-0000-7000-0000-000000000001/stream').expect(404)
  })

  it('returns 404 for batchId owned by another user', async () => {
    const { batch } = await createImportBatch(
      otherUser,
      'rss_feed',
      [{ url: 'https://other-owner.example.com/rss' }],
      { source: 'test' },
    )

    const request = createRequest()
    await request.authenticateAs(user)
    await request.get(`/api/v1/imports/${batch.id}/stream`).expect(404)
  })

  it('returns SSE content-type for an owned batch', async () => {
    const { batch } = await createImportBatch(
      user,
      'rss_feed',
      [{ url: 'https://stream-ct-test.example.com/rss' }],
      { source: 'test' },
    )

    const request = createRequest()
    await request.authenticateAs(user)

    // The SSE endpoint opens an infinite stream; use .parse() to short-circuit
    // after reading the initial bytes and inspect the response header.
    let contentType = ''
    await new Promise<void>((resolve, reject) => {
      const req = request
        .get(`/api/v1/imports/${batch.id}/stream`)
        .set('Accept', 'text/event-stream')
        .timeout(5000)
        .buffer(false)

      req.on(
        'response',
        (res: {
          headers: Record<string, string>
          destroy: () => void
          on: (...a: unknown[]) => unknown
        }) => {
          contentType = res.headers['content-type'] ?? ''
          res.destroy()
          resolve()
        },
      )

      req.on('error', (err: Error) => {
        // destroy() triggers an error; resolve with whatever header we captured
        if (contentType) resolve()
        else reject(err)
      })

      req.catch(() => {
        if (contentType) resolve()
      })
    })

    expect(contentType).toContain('text/event-stream')
  })

  it('streams progress for async user RSS import IDs', async () => {
    const submitted = await submitRssFeedImport(
      user,
      ['https://user-rss-stream-test.example.com/rss'],
      { follow: true },
    )

    const request = createRequest()
    await request.authenticateAs(user)

    const chunks: string[] = []
    await new Promise<void>((resolve, reject) => {
      const req = request
        .get(`/api/v1/imports/${submitted.import.id}/stream`)
        .set('Accept', 'text/event-stream')
        .timeout(5000)
        .buffer(false)

      req.on(
        'response',
        (res: {
          on: (event: string, fn: (...args: unknown[]) => void) => void
          destroy: () => void
        }) => {
          res.on('data', (...args: unknown[]) => {
            const chunk = String(args[0])
            chunks.push(chunk)
            res.destroy()
            resolve()
          })
          res.on('error', () => resolve())
        },
      )

      req.on('error', (err: Error) => {
        if (chunks.length > 0) resolve()
        else reject(err)
      })
      req.catch(() => {
        if (chunks.length > 0) resolve()
      })
    })

    const body = chunks.join('')
    expect(body).toContain('event: progress')
    expect(body).toContain(`"batchId":"${submitted.import.id}"`)
  })

  it('emits done for already-completed async user RSS import IDs', async () => {
    const rssFeed = await createTestRssFeed({})
    const submitted = await submitRssFeedImport(
      user,
      ['https://completed-user-rss-stream-test.example.com/rss'],
      { follow: true },
    )
    await updateRssFeedImportRowCompleted(submitted.rowIds[0]!, 'source_created', rssFeed.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const chunks: string[] = []
    await new Promise<void>((resolve, reject) => {
      const req = request
        .get(`/api/v1/imports/${submitted.import.id}/stream`)
        .set('Accept', 'text/event-stream')
        .timeout(5000)
        .buffer(false)

      req.on(
        'response',
        (res: {
          on: (event: string, fn: (...args: unknown[]) => void) => void
          destroy: () => void
        }) => {
          res.on('data', (...args: unknown[]) => {
            chunks.push(String(args[0]))
          })
          res.on('end', () => resolve())
          res.on('error', () => resolve())
        },
      )

      req.on('error', (err: Error) => {
        if (chunks.length > 0) resolve()
        else reject(err)
      })
      req.catch(() => {
        if (chunks.length > 0) resolve()
      })
    })

    const body = chunks.join('')
    expect(body).toContain('event: progress')
    expect(body).toContain('event: done')
  })

  it('emits done immediately for an already-completed batch', async () => {
    const { batch, rowIds } = await createImportBatch(
      user,
      'rss_feed',
      [{ url: 'https://done-stream-test.example.com/rss' }],
      { source: 'test' },
    )
    const rssFeed = await createTestRssFeed({})

    // Mark the only row as completed so batch gets completed_at set
    await updateRowCompleted(rowIds[0]!, rssFeed.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const chunks: string[] = []
    await new Promise<void>((resolve, reject) => {
      const req = request
        .get(`/api/v1/imports/${batch.id}/stream`)
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
          res.on('data', (...args: unknown[]) => {
            const chunk = String(args[0])
            chunks.push(chunk)
            if (chunks.join('').includes('event: done')) {
              res.destroy()
              resolve()
            }
          })
          res.on('end', () => resolve())
          res.on('error', () => resolve())
        },
      )

      req.on('error', (err: Error) => {
        if (chunks.length > 0) resolve()
        else reject(err)
      })
      req.catch(() => {
        if (chunks.length > 0) resolve()
      })
    })

    const body = chunks.join('')
    expect(body).toContain('event: done')
    expect(body).toContain('event: progress')
  })
})
