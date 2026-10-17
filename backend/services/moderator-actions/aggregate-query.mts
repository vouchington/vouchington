import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'

/** Shared 30/90-day counts for the REST aggregate and bounded MCP actor pages. */
export function buildModeratorActionCountsQuery(options: {
  communityId: string
  windowDays: 30 | 90
}) {
  assert(options.windowDays === 30 || options.windowDays === 90, 422, 'windowDays must be 30 or 90')
  const windowStart = getMinUUIDv7ForDate(
    new Date(Date.now() - options.windowDays * 24 * 60 * 60 * 1000),
  )
  return sql`
    SELECT actor_user_id, action_type, COUNT(*)::int AS count
    FROM moderator_actions
    WHERE community_id = ${options.communityId}
      AND actor_user_id IS NOT NULL
      AND id >= ${windowStart}::uuid
    GROUP BY actor_user_id, action_type
  `
}
