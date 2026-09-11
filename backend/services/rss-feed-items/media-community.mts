import type { RssFeedItemToUpsert } from './types.mts'

export function extractMediaDescription(item: Record<string, unknown>): string | undefined {
  const description = mediaDescription(item)
  const value = description?.value
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function extractMediaStarRating(
  item: Record<string, unknown>,
): RssFeedItemToUpsert['media:starRating'] | undefined {
  const starRating = mediaCommunity(item)?.starRating as Record<string, unknown> | undefined
  if (!starRating) return undefined

  const result = {
    average: finiteNumber(starRating.average),
    count: finiteNumber(starRating.count),
    min: finiteNumber(starRating.min),
    max: finiteNumber(starRating.max),
  }
  return Object.values(result).some(value => value !== undefined) ? result : undefined
}

export function extractMediaStatistics(
  item: Record<string, unknown>,
): RssFeedItemToUpsert['media:statistics'] | undefined {
  const statistics = mediaCommunity(item)?.statistics as Record<string, unknown> | undefined
  if (!statistics) return undefined

  const result = { views: finiteNumber(statistics.views) }
  return result.views !== undefined ? result : undefined
}

function mediaCommunity(item: Record<string, unknown>): Record<string, unknown> | undefined {
  const community = mediaGroup(item)?.community ?? media(item)?.community
  return community && typeof community === 'object'
    ? (community as Record<string, unknown>)
    : undefined
}

function mediaDescription(item: Record<string, unknown>): Record<string, unknown> | undefined {
  const description = mediaGroup(item)?.description ?? media(item)?.description
  return description && typeof description === 'object'
    ? (description as Record<string, unknown>)
    : undefined
}

function mediaGroup(item: Record<string, unknown>): Record<string, unknown> | undefined {
  const mediaObject = media(item)
  const singleGroup =
    mediaObject?.group && typeof mediaObject.group === 'object'
      ? (mediaObject.group as Record<string, unknown>)
      : undefined
  if (singleGroup) return singleGroup
  const groups = Array.isArray(mediaObject?.groups) ? mediaObject.groups : undefined
  const firstGroup = groups?.[0]
  return firstGroup && typeof firstGroup === 'object'
    ? (firstGroup as Record<string, unknown>)
    : undefined
}

function media(item: Record<string, unknown>): Record<string, unknown> | undefined {
  return item.media && typeof item.media === 'object'
    ? (item.media as Record<string, unknown>)
    : undefined
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : undefined
  }
  return undefined
}
