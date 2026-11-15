import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getReportingDayBounds } from './windows.mts'

export async function recomputeModeratorWorkloadDay(day: string, query: TransactionQuery) {
  const { firstId, afterLastId } = getReportingDayBounds(day)
  await query(sql`/* replaceModeratorWorkloadDay */
    DELETE FROM moderator_workload_daily_totals WHERE day = ${day}::date
  `)
  await query(sql`/* insertModeratorWorkloadDay */
    INSERT INTO moderator_workload_daily_totals(day, community_id, actor_user_id, action_type, count)
    SELECT ${day}::date, NULL::uuid, action.actor_user_id, action.action_type, count(*)
    FROM moderator_actions action JOIN users actor ON actor.id = action.actor_user_id
    WHERE action.id >= ${firstId} AND action.id < ${afterLastId}
    GROUP BY action.actor_user_id, action.action_type
    UNION ALL
    SELECT ${day}::date, action.community_id, action.actor_user_id, action.action_type, count(*)
    FROM moderator_actions action JOIN users actor ON actor.id = action.actor_user_id
    WHERE action.id >= ${firstId} AND action.id < ${afterLastId} AND action.community_id IS NOT NULL
    GROUP BY action.community_id, action.actor_user_id, action.action_type
  `)
}
