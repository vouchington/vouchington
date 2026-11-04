import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { canonicalizeUrl, isBareDomainUrl } from '@vouchington/utils/urls'
import { getHackerNewsWorkLimit, hackerNewsWorkConfig } from './hacker-news-work-limits.mts'

export type HackerNewsLookupTarget = {
  id: string
  url: string
  created_at: Date
  looked_up_at: Date | null
}

/**
 * Resolve complete canonical chains, including two-hop links left by concurrent updates.
 * Lateral point probes keep recursive cardinality estimates from scanning the whole URL store.
 */
export async function getHackerNewsLookupTargets(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<HackerNewsLookupTarget[]> {
  const ids = [...new Set(urlIds)]
  if (!ids.length) return []
  const targets = new Map<string, HackerNewsLookupTarget>()
  await hackerNewsWorkConfig.waitForInitialization()
  const batchSize = getHackerNewsWorkLimit('lookup_batch_size')
  for (let start = 0; start < ids.length; start += batchSize) {
    // no-mistakes-disable-next-line query-reached-per-item: each statement resolves one bounded batch of URL identities, not one URL
    const { rows } = await write<HackerNewsLookupTarget>( // oxlint-disable-line no-await-in-loop -- serialize bounded primary reads
      `/* getHackerNewsLookupTargets */
      WITH RECURSIVE chain AS (
        SELECT id, canonical_url_id, url, created_at, 0 AS depth
        FROM urls WHERE id = ANY($1::uuid[])
        UNION ALL
        SELECT u.id, u.canonical_url_id, u.url, u.created_at, chain.depth + 1
        FROM chain
        CROSS JOIN LATERAL (
          SELECT id, canonical_url_id, url, created_at FROM urls
          WHERE id = chain.canonical_url_id LIMIT 1
        ) u
        WHERE chain.depth < 10
      )
      SELECT DISTINCT chain.id, chain.url, chain.created_at, totals.looked_up_at
      FROM chain
      LEFT JOIN LATERAL (
        SELECT looked_up_at FROM url_hacker_news_totals
        WHERE url_id = chain.id LIMIT 1
      ) totals ON TRUE
      WHERE chain.canonical_url_id IS NULL`,
      [ids.slice(start, start + batchSize)],
      options,
    )
    for (const row of rows) {
      const canonical = canonicalizeUrl(row.url)
      if (!canonical || isBareDomainUrl(canonical.url)) continue
      targets.set(row.id, row)
    }
  }
  return [...targets.values()]
}

/** Recent URLs refresh daily, then weekly, then monthly, for a finite retention window. */
export function getHackerNewsRefreshDelay(
  target: HackerNewsLookupTarget,
  now: number,
): number | null {
  const ageDays = (now - new Date(target.created_at).getTime()) / 86_400_000
  if (ageDays >= getHackerNewsWorkLimit('retention_days')) return null
  if (ageDays < getHackerNewsWorkLimit('recent_age_days'))
    return getHackerNewsWorkLimit('recent_refresh_hours') * 3_600_000
  if (ageDays < getHackerNewsWorkLimit('middle_age_days'))
    return getHackerNewsWorkLimit('middle_refresh_hours') * 3_600_000
  return getHackerNewsWorkLimit('older_refresh_hours') * 3_600_000
}

export function isHackerNewsLookupDue(target: HackerNewsLookupTarget, now: number): boolean {
  if (!target.looked_up_at) return true
  const elapsed = now - new Date(target.looked_up_at).getTime()
  const interval = getHackerNewsRefreshDelay(target, now)
  return elapsed >= (interval ?? getHackerNewsWorkLimit('retention_days') * 86_400_000)
}
