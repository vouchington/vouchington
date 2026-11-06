import onError from '@modules/on-error'
import { enqueueHackerNewsLookups } from '@queues/hacker-news/enqueues'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  getHackerNewsLookupTargets,
  getPrimaryHackerNewsLookupTargets,
  isHackerNewsLookupDue,
} from './hacker-news-lookup-state.mts'

/** Admission is best effort: Algolia and queue outages never fail ingestion or detail reads. */
export async function enqueueMissingHackerNewsLookups(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<void> {
  try {
    const targets =
      options.readOnly === false
        ? await getPrimaryHackerNewsLookupTargets(urlIds, options)
        : await getHackerNewsLookupTargets(urlIds, options)
    const now = Date.now()
    await enqueueHackerNewsLookups(
      targets.flatMap(target => (isHackerNewsLookupDue(target, now) ? [target.id] : [])),
    )
  } catch (err) {
    onError(
      err instanceof Error ? err : new Error('Hacker News lookup admission failed', { cause: err }),
    )
  }
}
