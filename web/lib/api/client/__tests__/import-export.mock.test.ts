import { describe, expect, it, vi } from 'vitest'
import { exportRssFeeds, importTopics } from '../import-export'
import { ApiError } from '../../error'

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn<VitestLooseMock>() }))
vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
      },
    }) as unknown as typeof import('../instance'),
)

describe('importTopics', () => {
  it('calls POST /api/v1/my/import/topics with a retained import-attempt identity', async () => {
    mockPost.mockResolvedValue({ results: [] })
    await importTopics({ names: ['Tech', 'Finance'] })
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/my/import/topics',
      { names: ['Tech', 'Finance'] },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    )
  })

  it('reuses the import-attempt identity after a lost response', async () => {
    mockPost
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ results: [] })
    const body = { names: ['Retry Topic'] }
    const initialCallCount = mockPost.mock.calls.length

    await expect(importTopics(body)).rejects.toThrow('response lost')
    await expect(importTopics(body)).resolves.toEqual({ results: [] })

    expect(mockPost.mock.calls[initialCallCount + 1]?.[2]?.headers?.['Idempotency-Key']).toBe(
      mockPost.mock.calls[initialCallCount]?.[2]?.headers?.['Idempotency-Key'],
    )
  })

  it('reuses the import-attempt identity after an in-progress response', async () => {
    mockPost
      .mockRejectedValueOnce(
        new ApiError('Import still in progress', 409, {
          code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
          retry_after: 1,
        }),
      )
      .mockResolvedValueOnce({ results: [] })
    const body = { names: ['Concurrent Topic'] }
    const initialCallCount = mockPost.mock.calls.length

    await expect(importTopics(body)).rejects.toMatchObject({ status: 409 })
    await expect(importTopics(body)).resolves.toEqual({ results: [] })

    expect(mockPost.mock.calls[initialCallCount + 1]?.[2]?.headers?.['Idempotency-Key']).toBe(
      mockPost.mock.calls[initialCallCount]?.[2]?.headers?.['Idempotency-Key'],
    )
  })
})

describe('exportRssFeeds', () => {
  it('returns a direct download URL without query params', () => {
    expect(exportRssFeeds()).toBe('/api/v1/my/export/rss-feeds')
  })

  it('appends feed_type param to the direct download URL', () => {
    expect(exportRssFeeds('article')).toBe('/api/v1/my/export/rss-feeds?feed_type=article')
  })
})
