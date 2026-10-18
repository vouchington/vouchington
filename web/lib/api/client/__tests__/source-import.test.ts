import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import type { CreateSourceResponseBody } from '@/types/api-responses'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { ApiError } from '../../error'
import { getSourceImportErrorMessages, waitForSourceImport } from '../source-import'

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

  it('maps terminal feed errors through the production translation catalog', async () => {
    const t = createTranslator('en', await loadJsonMessages('en'))
    expect(getSourceImportErrorMessages(t)).toMatchObject({
      INVALID_FEED_CONTENT: 'The request was invalid. Please try again.',
      FEED_FETCH_TIMEOUT: 'The request timed out. Please try again.',
    })
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
    await expect(finished).resolves.toEqual({ entityId: 'feed-id', topicSlug: 'feed-slug' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('exposes terminal row error codes as expected API errors', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      Response.json({
        import: { ...submission.import, pending_rows: 0, failed_rows: 1 },
        rows: [{ status: 'error', error_code: 'INVALID_FEED_CONTENT' }],
      }),
    )

    vi.stubGlobal('fetch', fetch)
    await expect(waitForSourceImport(submission)).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'INVALID_FEED_CONTENT',
    } satisfies Partial<ApiError>)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
