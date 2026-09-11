'use client'

import { useNow } from '@/hooks/use-now'
import { formatAbsolute, formatRelative } from './time-ago-format'
import { useTranslations } from '@/lib/i18n/use-translations'

/**
 * Hydration-safe relative time display.
 *
 * Two-phase render:
 *  1. SSR + first client render: absolute UTC date derived purely from the `date` prop —
 *     deterministic across server and client, so React never sees a mismatch.
 *  2. After mount: live relative label, re-computed every 30s via a shared singleton
 *     interval (all `<TimeAgo>` instances on the page share one timer).
 *
 * Durations under 60 seconds display as "just now" to avoid per-second drift.
 * Invalid or missing dates render "—".
 */
export function TimeAgo({ date }: { date: string | null | undefined }) {
  const t = useTranslations()
  const ts = date ? new Date(date).getTime() : Number.NaN
  const valid = Number.isFinite(ts) && ts >= 0
  const now = useNow()

  if (!valid) return <span>{t('extracted.shared.timeAgo.text_bda05058')}</span>

  const iso = new Date(ts).toISOString()
  const label = now === null ? formatAbsolute(ts) : formatRelative(ts, now, t)
  return (
    <time
      dateTime={iso}
      title={iso}
    >
      {label}
    </time>
  )
}
