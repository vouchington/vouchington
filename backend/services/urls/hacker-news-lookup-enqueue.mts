import onError from '@modules/on-error'
import { enqueueHackerNewsLookups } from '@queues/hacker-news/enqueues'
import type { QueryOptions } from '@data-stores/psql/types'
import { getHackerNewsLookupTargets } from './hacker-news-lookup-state.mts'
import { getHackerNewsWorkLimit } from './hacker-news-work-limits.mts'

/** Admission is best effort: Algolia and queue outages never fail ingestion or detail reads. */
export async function enqueueMissingHackerNewsLookups(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<void> {
  try {
    const targets = await getHackerNewsLookupTargets(urlIds, options)
    const cutoff = Date.now() - getHackerNewsWorkLimit('retention_days') * 86_400_000
    await enqueueHackerNewsLookups(
      targets.flatMap(target =>
        !target.looked_up_at || new Date(target.looked_up_at).getTime() <= cutoff
          ? [target.id]
          : [],
      ),
    )
  } catch (err) {
    onError(
      err instanceof Error ? err : new Error('Hacker News lookup admission failed', { cause: err }),
    )
  }
}
