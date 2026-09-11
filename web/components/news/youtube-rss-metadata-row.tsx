import type { NumberFormatLocale } from '@ts-shared/utils/format'
import type { RssFeedItem } from '@/types/rss-feed-items'
import { cn } from '@/lib/utils'
import type { useTranslations } from '@/lib/i18n/use-translations'

type YoutubeRssMetadataRowProps = {
  item: Pick<RssFeedItem, 'data'>
  uiLocale?: NumberFormatLocale
  className?: string
  t: ReturnType<typeof useTranslations>
}

const RATING_AVERAGE_FORMATTERS = new Map<string, Intl.NumberFormat>()

export function YoutubeRssMetadataRow({
  item,
  uiLocale,
  className,
  t,
}: YoutubeRssMetadataRowProps) {
  if (item.data.video_platform !== 'youtube') return null

  const statistics = item.data['media:statistics']
  const starRating = item.data['media:starRating']
  const views = finiteNumber(statistics?.views)
  const ratingAverage = finiteNumber(starRating?.average)
  const ratingCount = finiteNumber(starRating?.count)
  if (views === null && ratingAverage === null && ratingCount === null) return null

  const parts: Array<{ key: string; text: string }> = []
  if (views !== null) {
    parts.push({
      key: 'views',
      text: t('shared.countLabel.format', { count: views, unit: 'view' }),
    })
  }
  if (ratingAverage !== null && ratingCount !== null) {
    parts.push({
      key: 'rating-average-count',
      text: `${formatRatingAverage(ratingAverage, uiLocale)} ${t('extracted.news.youtubeRssMetadataRow.ratingFrom_3f6dba29')} ${t(
        'shared.countLabel.format',
        { count: ratingCount, unit: 'rating' },
      )}`,
    })
  } else if (ratingAverage !== null) {
    parts.push({
      key: 'rating-average',
      text: `${formatRatingAverage(ratingAverage, uiLocale)} ${t('extracted.news.youtubeRssMetadataRow.rating_112895d7')}`,
    })
  } else if (ratingCount !== null) {
    parts.push({
      key: 'rating-count',
      text: t('shared.countLabel.format', { count: ratingCount, unit: 'rating' }),
    })
  }

  return (
    <p
      className={cn('text-xs text-muted-foreground', className)}
      data-pw='youtube-rss-metadata-row'
    >
      <span>YouTube</span>
      {parts.map(part => (
        <span key={part.key}>
          {' '}
          <span aria-hidden='true'>&middot;</span> {part.text}
        </span>
      ))}
    </p>
  )
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
  }
  return null
}

function formatRatingAverage(value: number, locale: NumberFormatLocale = 'en') {
  return getRatingAverageFormatter(locale).format(value)
}

function getRatingAverageFormatter(locale: NumberFormatLocale) {
  const key = Array.isArray(locale) ? locale.join('\u0000') : locale
  const cached = RATING_AVERAGE_FORMATTERS.get(key)
  if (cached) return cached
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  RATING_AVERAGE_FORMATTERS.set(key, formatter)
  return formatter
}
