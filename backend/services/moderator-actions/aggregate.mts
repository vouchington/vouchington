import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
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
  assert(options.windowDays === 30 || options.windowDays === 90, 422, 'windowDays must be 30 or 90')

  const windowStart = getMinUUIDv7ForDate(
    new Date(Date.now() - options.windowDays * 24 * 60 * 60 * 1000),
  )

  const query = sql`/* aggregateModeratorActionCounts */
    SELECT
      actor_id,
      action_type,
      COUNT(*)::int AS count
    FROM moderator_actions
    WHERE community_id = ${options.communityId}
      AND actor_id IS NOT NULL
      AND id >= ${windowStart}::uuid
    GROUP BY actor_id, action_type
  `

  const { rows } = await read(query, options)

  // Reduce raw rows into per-actor totals with per-type breakdowns
  const byActor = new Map<string, ModeratorActionCounts>()

  for (const row of rows) {
    const { actor_id, action_type, count } = row as {
      actor_id: string
      action_type: keyof ModeratorActionCounts['counts']
      count: number
    }

    let entry = byActor.get(actor_id)
    if (!entry) {
      entry = { actor_id, total: 0, counts: {} }
      byActor.set(actor_id, entry)
    }
    entry.counts[action_type] = count
    entry.total += count
  }

  return Array.from(byActor.values()).toSorted((a, b) => b.total - a.total)
}
