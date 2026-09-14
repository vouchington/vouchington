import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { YoutubeRssMetadataRow } from './youtube-rss-metadata-row'
import type { useTranslations } from '@/lib/i18n/use-translations'
import type { RssFeedItem } from '@/types/rss-feed-items'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

describe('YoutubeRssMetadataRow', () => {
  let t: ReturnType<typeof useTranslations>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  function renderRow(data: RssFeedItem['data'], uiLocale: 'de' | 'en' = 'en') {
    return render(
      <YoutubeRssMetadataRow
        item={{ data }}
        uiLocale={uiLocale}
        t={t}
      />,
    )
  }

  it('renders a decimal average with only the rating average', () => {
    const { container } = renderRow({
      link: 'https://www.youtube.com/watch?v=abc123',
      guid: 'yt:video:abc123',
      video_platform: 'youtube',
      'media:starRating': { average: 4.75 },
    })

    expect(container.querySelector('[data-pw="youtube-rss-metadata-row"]')?.textContent).toBe(
      'YouTube \u00B7 4.75 rating',
    )
  })

  it('renders only the rating count when the average is missing', () => {
    const { container } = renderRow({
      link: 'https://www.youtube.com/watch?v=abc123',
      guid: 'yt:video:abc123',
      video_platform: 'youtube',
      'media:starRating': { count: 1 },
    })

    expect(container.querySelector('[data-pw="youtube-rss-metadata-row"]')?.textContent).toBe(
      'YouTube \u00B7 1 rating',
    )
  })

  it('does not coerce null or blank values into zero-value metadata', () => {
    const { container } = renderRow({
      link: 'https://www.youtube.com/watch?v=abc123',
      guid: 'yt:video:abc123',
      video_platform: 'youtube',
      'media:statistics': { views: Number.NaN },
      'media:starRating': { average: Infinity, count: '-1' as unknown as number },
    })

    expect(container.querySelector('[data-pw="youtube-rss-metadata-row"]')).toBeNull()
  })

  it('formats decimal ratings with the resolved UI locale', () => {
    const { container } = renderRow(
      {
        link: 'https://www.youtube.com/watch?v=abc123',
        guid: 'yt:video:abc123',
        video_platform: 'youtube',
        'media:starRating': { average: 4.75 },
      },
      'de',
    )

    expect(container.querySelector('[data-pw="youtube-rss-metadata-row"]')?.textContent).toBe(
      'YouTube \u00B7 4,75 rating',
    )
  })
})
