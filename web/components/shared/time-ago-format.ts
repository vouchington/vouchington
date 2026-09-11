import type { useTranslations } from '@/lib/i18n/use-translations'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Returns a stable UTC date string (e.g. "Apr 10, 2026") independent of runtime locale or ICU version. */
export function formatAbsolute(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** Returns a human-readable relative time string. Durations under 60s return "just now". */
export function formatRelative(
  ms: number,
  now: number,
  t: ReturnType<typeof useTranslations>,
): string {
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000))
  if (diffSec < 60) return t('extracted.shared.timeAgoFormat.justNow_7ddb44d8')
  const minutes = Math.floor(diffSec / 60)
  if (minutes < 60) return t('shared.timeAgo.relativeDuration', { value: minutes, unit: 'minute' })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('shared.timeAgo.relativeDuration', { value: hours, unit: 'hour' })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('shared.timeAgo.relativeDuration', { value: days, unit: 'day' })
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return t('shared.timeAgo.relativeDuration', { value: weeks, unit: 'week' })
  const months = Math.floor(days / 30)
  if (days < 365) return t('shared.timeAgo.relativeDuration', { value: months, unit: 'month' })
  const years = Math.floor(days / 365)
  return t('shared.timeAgo.relativeDuration', { value: years, unit: 'year' })
}
