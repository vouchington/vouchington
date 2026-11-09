import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ViewUrl } from './types.mts'
import { getHackerNewsWorkLimit, hackerNewsWorkConfig } from './hacker-news-work-limits.mts'

/** Resolve existing URL identities through their terminal-root foreign keys. */
export async function getCanonicalUrlsByIdBatch(
  ids: readonly string[],
  options: QueryOptions = {},
): Promise<Array<ViewUrl | null>> {
  if (ids.length === 0) return []
  await hackerNewsWorkConfig.waitForInitialization()
  const size = getHackerNewsWorkLimit('lookup_batch_size')
  const uniqueIds = [...new Set(ids.map(id => id.toLowerCase()))]
  const byInputId = new Map<string, ViewUrl>()
  const query = options.readOnly === false ? write : read
  for (let start = 0; start < uniqueIds.length; start += size) {
    // no-mistakes-disable-next-line query-reached-per-item: each statement resolves one bounded batch of URL identities, not one URL
    const { rows } = await query<ViewUrl & { input_id: string }>( // oxlint-disable-line no-await-in-loop -- serialize bounded reads
      `/* getCanonicalUrlsByIdBatch */
      SELECT source.id AS input_id, target.*
      FROM urls source
      JOIN view_urls target
        ON target.id = COALESCE(source.canonical_url_id, source.id)
      WHERE source.id = ANY($1::uuid[])`,
      [uniqueIds.slice(start, start + size)],
      options,
    )
    for (const { input_id, ...url } of rows) byInputId.set(input_id, url)
  }
  return ids.map(id => byInputId.get(id.toLowerCase()) ?? null)
}
