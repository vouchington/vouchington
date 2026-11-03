import { describe, expect, it } from 'vitest'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { getRssFeedDeclaredLanguageForTest, getTestPodcastShow } from '@voucha/test-helpers'
import { getRssFeedCategories } from './categories.mts'
import { getRssFeedById } from './get.mts'
import { persistFeedMetadataAndReconcileLanguage } from './reconcile-item-language.mts'

describe('persistFeedMetadataAndReconcileLanguage', () => {
  it('persists missing feed metadata and reports a language change', async () => {
    const feed = await createTestRssFeed({})

    const languageChanged = await persistFeedMetadataAndReconcileLanguage(
      feed.id,
      { title: ' Example Feed ', language: 'fr-FR' },
      null,
      null,
    )

    expect(languageChanged).toBe(true)
    expect(await getRssFeedById(feed.id)).toMatchObject({ title: 'Example Feed' })
    expect(await getRssFeedDeclaredLanguageForTest(feed.id)).toBe('fr')
  })

  it('clears declared language and reports a change when a feed drops its language', async () => {
    const feed = await createTestRssFeed({ title: 'Existing' })
    await persistFeedMetadataAndReconcileLanguage(feed.id, { language: 'fr' }, 'Existing', null)
    expect(await getRssFeedDeclaredLanguageForTest(feed.id)).toBe('fr')

    const languageChanged = await persistFeedMetadataAndReconcileLanguage(
      feed.id,
      { title: 'Existing' },
      'Existing',
      'fr',
    )

    expect(languageChanged).toBe(true)
    expect(await getRssFeedById(feed.id)).toMatchObject({ title: 'Existing' })
    expect(await getRssFeedDeclaredLanguageForTest(feed.id)).toBeNull()
  })

  it('skips metadata updates and reports no change when metadata is unchanged', async () => {
    const feed = await createTestRssFeed({ title: 'Existing' })

    const languageChanged = await persistFeedMetadataAndReconcileLanguage(
      feed.id,
      { language: 'fr' },
      'Existing',
      'fr',
    )

    expect(languageChanged).toBe(false)
    expect(await getRssFeedById(feed.id)).toMatchObject({ title: 'Existing' })
    expect(await getRssFeedDeclaredLanguageForTest(feed.id)).toBeNull()
  })

  it('deletes categories when iTunes metadata is present but categories list is empty', async () => {
    const feed = await createTestRssFeed({ title: 'Existing' })
    await persistFeedMetadataAndReconcileLanguage(
      feed.id,
      { itunes: { author: 'Test Author', categories: [{ text: 'News' }] } },
      'Existing',
      null,
      'podcast',
    )
    expect((await getRssFeedCategories(feed.id)).map(c => c.category_text)).toEqual(['news'])

    await persistFeedMetadataAndReconcileLanguage(
      feed.id,
      { itunes: { author: 'Test Author' } },
      'Existing',
      null,
      'podcast',
    )

    expect(await getRssFeedCategories(feed.id)).toHaveLength(0)
    expect(await getTestPodcastShow(feed.id)).toMatchObject({ itunes_author: 'Test Author' })
  })
})
