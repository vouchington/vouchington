import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateSourceResponseBody } from '@/types/api-responses'
import { ApiError } from '../../error'
import { waitForSourceImport } from '../source-import'

const submission: CreateSourceResponseBody = {
  import: {
    id: 'import-id',
    total_rows: 1,
    completed_rows: 0,
    failed_rows: 0,
    pending_rows: 1,
    completed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
  },
  status_url: '/api/v1/my/import/rss-feeds/import-id',
}

describe('waitForSourceImport', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('resolves the feed slug only after its accepted import completes', async () => {
    const completion = Promise.withResolvers<Response>()
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValueOnce(completion.promise)
    vi.stubGlobal('fetch', fetch)
    const finished = waitForSourceImport(submission)
    expect(fetch).toHaveBeenCalledTimes(1)
    completion.resolve(
      Response.json({
        import: { ...submission.import, pending_rows: 0, completed_rows: 1 },
        rows: [{ status: 'source_created', entity_id: 'feed-id', topic_slug: 'feed-slug' }],
      }),
    )
    await expect(finished).resolves.toBe('feed-slug')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not navigate to a feed when processing failed', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      Response.json({
        import: { ...submission.import, pending_rows: 0, failed_rows: 1 },
        rows: [{ status: 'error', error_code: 'INVALID_FEED_CONTENT' }],
      }),
    )

    vi.stubGlobal('fetch', fetch)
    const failure = await waitForSourceImport(submission).catch((err: unknown) => err)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({
      message: 'Source import failed',
      status: 422,
      code: 'INVALID_FEED_CONTENT',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports an unrecognized row failure as an unexpected error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
        Response.json({
          import: { ...submission.import, pending_rows: 0, failed_rows: 1 },
          rows: [{ status: 'error', error_code: 'IMPORT_FAILED' }],
        }),
      ),
    )
    await expect(waitForSourceImport(submission)).rejects.toMatchObject({
      status: 500,
      code: 'IMPORT_FAILED',
    })
  })

  it('retries a fresh import whose status the replica has not replayed yet', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ message: 'Not found' }, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          import: { ...submission.import, pending_rows: 0, completed_rows: 1 },
          rows: [{ status: 'source_created', entity_id: 'feed-id', topic_slug: 'feed-slug' }],
        }),
      )
    vi.stubGlobal('fetch', fetch)
    const finished = waitForSourceImport(submission)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(finished).resolves.toBe('feed-slug')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
