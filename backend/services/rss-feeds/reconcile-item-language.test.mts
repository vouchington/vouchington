import { beforeEach, describe, expect, it, vi } from 'vitest'
import { persistFeedMetadataAndReconcileLanguage } from './reconcile-item-language.mts'

describe('persistFeedMetadataAndReconcileLanguage', () => {
  const readImpl = vi.fn<(...args: any[]) => Promise<any>>()
  const updateRssFeedByIdImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null)
  const enqueueBulkLanguageDetectionImpl = vi
    .fn<(...args: any[]) => Promise<any>>()
    .mockResolvedValue(null)
  const upsertPodcastShowImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null)
  const deletePodcastShowImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null)
  const upsertRssFeedCategoriesImpl = vi
    .fn<(...args: any[]) => Promise<any>>()
    .mockResolvedValue(null)
  const deleteRssFeedCategoriesImpl = vi
    .fn<(...args: any[]) => Promise<any>>()
    .mockResolvedValue(null)
  const createFeedCategoryRelationsImpl = vi
    .fn<(...args: any[]) => Promise<any>>()
    .mockResolvedValue(null)

  const deps = {
    readImpl,
    updateRssFeedByIdImpl,
    enqueueBulkLanguageDetectionImpl,
    upsertPodcastShowImpl,
    deletePodcastShowImpl,
    upsertRssFeedCategoriesImpl,
    deleteRssFeedCategoriesImpl,
    createFeedCategoryRelationsImpl,
  }

  beforeEach(() => {
    readImpl.mockReset()
    updateRssFeedByIdImpl.mockReset()
    enqueueBulkLanguageDetectionImpl.mockReset()
    upsertPodcastShowImpl.mockReset()
    deletePodcastShowImpl.mockReset()
    upsertRssFeedCategoriesImpl.mockReset()
    deleteRssFeedCategoriesImpl.mockReset()
    createFeedCategoryRelationsImpl.mockReset()
    readImpl.mockResolvedValue({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: 2,
      rows: [{ id: 'item-1' }, { id: 'item-2' }],
    })
    updateRssFeedByIdImpl.mockResolvedValue(null)
    enqueueBulkLanguageDetectionImpl.mockResolvedValue(null)
    upsertPodcastShowImpl.mockResolvedValue(null)
    deletePodcastShowImpl.mockResolvedValue(null)
    upsertRssFeedCategoriesImpl.mockResolvedValue(null)
    deleteRssFeedCategoriesImpl.mockResolvedValue(null)
    createFeedCategoryRelationsImpl.mockResolvedValue(null)
  })

  it('persists missing feed metadata and re-enqueues existing items when language changes', async () => {
    await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { title: ' Example Feed ', language: 'fr-FR' },
      null,
      null,
      null,
      deps,
    )

    expect(updateRssFeedByIdImpl).toHaveBeenCalledWith('feed-1', {
      title: 'Example Feed',
      declared_language: 'fr',
    })
    expect(readImpl).toHaveBeenCalledWith(expect.stringContaining('rss_feed_item_sources'), [
      'feed-1',
    ])
    expect(enqueueBulkLanguageDetectionImpl).toHaveBeenCalledOnce()
    expect(enqueueBulkLanguageDetectionImpl).toHaveBeenCalledWith('rss_feed_item', [
      'item-1',
      'item-2',
    ])
  })

  it('clears declared language and re-enqueues items when a feed drops its language', async () => {
    await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { title: 'Existing' },
      'Existing',
      'fr',
      null,
      deps,
    )

    expect(updateRssFeedByIdImpl).toHaveBeenCalledWith('feed-1', { declared_language: null })
    expect(enqueueBulkLanguageDetectionImpl).toHaveBeenCalledOnce()
  })

  it('re-enqueues large feeds in bounded batches', async () => {
    readImpl.mockResolvedValueOnce({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: 1001,
      rows: Array.from({ length: 1001 }, (_, index) => ({ id: `item-${index}` })),
    })

    await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { language: 'en' },
      'Existing',
      null,
      null,
      deps,
    )

    await vi.waitFor(() => expect(enqueueBulkLanguageDetectionImpl).toHaveBeenCalledTimes(2))
    expect(enqueueBulkLanguageDetectionImpl.mock.calls[0]![1]).toHaveLength(1000)
    expect(enqueueBulkLanguageDetectionImpl.mock.calls[1]![1]).toEqual(['item-1000'])
  })

  it('skips metadata updates and re-enqueues when metadata is unchanged', async () => {
    await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { language: 'fr' },
      'Existing',
      'fr',
      null,
      deps,
    )

    expect(updateRssFeedByIdImpl).not.toHaveBeenCalled()
    expect(readImpl).not.toHaveBeenCalled()
    expect(enqueueBulkLanguageDetectionImpl).not.toHaveBeenCalled()
  })

  it('swallows asynchronous re-enqueue failures after persisting metadata', async () => {
    readImpl.mockRejectedValueOnce(new Error('read failed'))

    await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { language: 'en' },
      'Existing',
      null,
      null,
      deps,
    )

    expect(updateRssFeedByIdImpl).toHaveBeenCalledWith('feed-1', { declared_language: 'en' })
    expect(readImpl).toHaveBeenCalledTimes(1)
  })

  it('deletes categories when iTunes metadata is present but categories list is empty', async () => {
    await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { itunes: { author: 'Test Author' } },
      'Existing',
      null,
      'podcast',
      deps,
    )

    expect(updateRssFeedByIdImpl).not.toHaveBeenCalled()
    expect(upsertPodcastShowImpl).toHaveBeenCalledOnce()
    expect(deleteRssFeedCategoriesImpl).toHaveBeenCalledWith('feed-1')
  })
})
