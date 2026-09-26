import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { formatUtcDate } from '@ts-shared/utils/format'
import { beforeAll, describe, expect, it } from 'vitest'
import { StoryMeta } from '@/components/news/news-item-cluster-meta'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { seedMessages } from '@/lib/i18n/use-translations'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import type { Story } from '@/types/rss-feed-items'

const publishedAt = '2025-01-15T10:00:00.000Z'
const eventDateKey = 'extracted.news.newsItemClusterMeta.eventDate_edd33a99' as const
const uiLocales = ['es', 'fr', 'pt'] as const

const story: Story = {
  id: 'story-1',
  title: null,
  cluster_reason: null,
  published_at: publishedAt,
  official_rss_feed_item_id: null,
}

describe('StoryMeta event date', () => {
  const catalogs = new Map<string, Awaited<ReturnType<typeof loadJsonMessages>>>()

  beforeAll(async () => {
    for (const locale of uiLocales) {
      const messages = await loadJsonMessages(locale)
      catalogs.set(locale, messages)
      seedMessages(locale, messages)
    }
  })

  it.each(uiLocales)('formats the interpolated event date in the %s UI locale', locale => {
    const messages = catalogs.get(locale)
    if (messages === undefined) throw new Error(`missing ${locale} catalog`)

    const localizedDate = formatUtcDate(publishedAt, locale)
    expect(localizedDate).not.toBe(formatUtcDate(publishedAt))
    const label = createTranslator(locale, messages)(eventDateKey, { date: localizedDate })

    render(
      <UiLocaleContext.Provider value={locale}>
        <StoryMeta story={story} />
      </UiLocaleContext.Provider>,
    )

    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
