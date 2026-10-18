import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateSourceResponseBody } from '@/types/api-responses'
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
  afterEach(() => vi.unstubAllGlobals())

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
    await expect(waitForSourceImport(submission)).rejects.toThrow('Source import failed')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
