import { beforeEach, describe, expect, it, vi } from 'vitest'
import { persistFeedMetadataAndReconcileLanguage } from './reconcile-item-language.mts'

describe('persistFeedMetadataAndReconcileLanguage', () => {
  const updateRssFeedByIdImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null)
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
    updateRssFeedByIdImpl,
    upsertPodcastShowImpl,
    deletePodcastShowImpl,
    upsertRssFeedCategoriesImpl,
    deleteRssFeedCategoriesImpl,
    createFeedCategoryRelationsImpl,
  }

  beforeEach(() => {
    for (const impl of Object.values(deps)) impl.mockReset().mockResolvedValue(null)
  })

  it('persists missing feed metadata and reports a language change', async () => {
    const languageChanged = await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { title: ' Example Feed ', language: 'fr-FR' },
      null,
      null,
      null,
      deps,
    )

    expect(languageChanged).toBe(true)
    expect(updateRssFeedByIdImpl).toHaveBeenCalledWith('feed-1', {
      title: 'Example Feed',
      declared_language: 'fr',
    })
  })

  it('clears declared language and reports a change when a feed drops its language', async () => {
    const languageChanged = await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { title: 'Existing' },
      'Existing',
      'fr',
      null,
      deps,
    )

    expect(languageChanged).toBe(true)
    expect(updateRssFeedByIdImpl).toHaveBeenCalledWith('feed-1', { declared_language: null })
  })

  it('skips metadata updates and reports no change when metadata is unchanged', async () => {
    const languageChanged = await persistFeedMetadataAndReconcileLanguage(
      'feed-1',
      { language: 'fr' },
      'Existing',
      'fr',
      null,
      deps,
    )

    expect(languageChanged).toBe(false)
    expect(updateRssFeedByIdImpl).not.toHaveBeenCalled()
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
