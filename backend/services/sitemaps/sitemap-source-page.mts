import type { SitemapSourcePage, SourceEntry } from './generation-page-types.mts'

export function sitemapSourcePage<T extends SourceEntry>(
  rows: readonly T[],
  limit: number,
): SitemapSourcePage<T> {
  if (rows.length > limit) throw new Error('Sitemap source exceeded its query limit')
  const exhausted = rows.length < limit
  const entries = exhausted ? [...rows] : rows.slice(0, limit - 1)
  const last = entries.at(-1)
  return {
    entries,
    exhausted,
    afterId: last?.id ?? null,
    afterPath: last?.path ?? null,
    boundId: rows[0]?.id ?? null,
  }
}
