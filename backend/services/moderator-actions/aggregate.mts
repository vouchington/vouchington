import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { buildModeratorActionCountsQuery } from './aggregate-query.mts'
import type { ModeratorActionCounts } from './types.mts'

export interface AggregateModeratorActionCountsOptions extends QueryOptions {
  communityId: string
  windowDays: 30 | 90
}

/**
 * Aggregate per-moderator action counts for a community over the last N days.
 * Results are sorted by total actions descending.
 *
 * Uses a UUIDv7 lower-bound on `id` so the `(community_id, id DESC)` index
 * can apply a range predicate and stop scanning at rows older than the window,
 * rather than using `uuid_extract_timestamp(id)` which is opaque to the planner
 * and forces a full community-partition scan with row-by-row timestamp checks.
 */
export async function aggregateModeratorActionCounts(
  options: AggregateModeratorActionCountsOptions,
): Promise<ModeratorActionCounts[]> {
  const query = sql`/* aggregateModeratorActionCounts */`
  query.append(buildModeratorActionCountsQuery(options))

  const { rows } = await read(query, options)

  // Reduce raw rows into per-actor totals with per-type breakdowns
  const byActor = new Map<string, ModeratorActionCounts>()

  for (const row of rows) {
    const { actor_user_id, action_type, count } = row as {
      actor_user_id: string
      action_type: keyof ModeratorActionCounts['counts']
      count: number
    }

    let entry = byActor.get(actor_user_id)
    if (!entry) {
      entry = { actor_user_id, total: 0, counts: {} }
      byActor.set(actor_user_id, entry)
    }
    entry.counts[action_type] = count
    entry.total += count
  }

  return Array.from(byActor.values()).toSorted((a, b) => b.total - a.total)
}
