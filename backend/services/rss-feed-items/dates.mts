import type { RssFeedItemToUpsert } from './types.mts'

const MIN_RSS_ITEM_DATE_MS = Date.UTC(1970, 0, 1)
const ISO_DATE_YEAR_PATTERN = /^([+-]?\d{4,6})-\d{2}-\d{2}/
const RFC_822_DATE_YEAR_PATTERN = /^(?:[A-Za-z]{3},\s*)?\d{1,2}\s+[A-Za-z]{3}\s+(\d{4})(?:\s|$)/

function isUsableDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed !== '' && trimmed.toLowerCase() !== 'null'
}

export function sanitizeRssFeedItemDateString(value: unknown): string | undefined {
  if (!isUsableDateString(value)) return undefined

  const trimmed = value.trim()
  const knownYear = getKnownDateYear(trimmed)
  if (knownYear !== null && knownYear < 1970) return undefined

  const parsedMs = Date.parse(trimmed)
  if (!Number.isFinite(parsedMs) || parsedMs < MIN_RSS_ITEM_DATE_MS) return undefined

  return trimmed
}

export function sanitizeRssFeedItemDates(feedItem: RssFeedItemToUpsert): RssFeedItemToUpsert {
  return {
    ...feedItem,
    pubDate: sanitizeRssFeedItemDateString(feedItem.pubDate),
    isoDate: sanitizeRssFeedItemDateString(feedItem.isoDate),
  }
}

export function itemIsoDate(item: Record<string, unknown>): string | undefined {
  const isoDate = sanitizeRssFeedItemDateString(item.isoDate)
  if (isoDate !== undefined) return isoDate

  const dc = item.dc
  if (typeof dc === 'object' && dc !== null) {
    const dcObj = dc as { date?: unknown; dates?: unknown[] }
    const dcDate = sanitizeRssFeedItemDateString(dcObj.date)
    if (dcDate !== undefined) return dcDate
    if (Array.isArray(dcObj.dates)) {
      const firstDate = dcObj.dates[0]
      const dcDatesFirst = sanitizeRssFeedItemDateString(firstDate)
      if (dcDatesFirst !== undefined) return dcDatesFirst
    }
  }

  const published = sanitizeRssFeedItemDateString(item.published)
  if (published !== undefined) return published
  const datePublished = sanitizeRssFeedItemDateString(item.date_published)
  if (datePublished !== undefined) return datePublished
  const updated = sanitizeRssFeedItemDateString(item.updated)
  if (updated !== undefined) return updated

  return undefined
}

function getKnownDateYear(value: string): number | null {
  const isoYear = value.match(ISO_DATE_YEAR_PATTERN)?.[1]
  if (isoYear !== undefined) return Number.parseInt(isoYear, 10)

  const year = value.match(RFC_822_DATE_YEAR_PATTERN)?.[1]
  if (year === undefined) return null
  return Number.parseInt(year, 10)
}
