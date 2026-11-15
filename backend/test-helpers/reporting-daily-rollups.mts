import { v7 } from 'uuid'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { recomputeGrowthDay } from '@services/reporting-daily-rollups/recompute-growth'
import { runWithTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestModeratorWorkloadDailyTotal(options: {
  day: string
  communityId: string | null
  actorUserId: string
  actionType: string
  count: number
}): Promise<void> {
  await write(sql`/* insertTestModeratorWorkloadDailyTotal */
    INSERT INTO moderator_workload_daily_totals
      (day, community_id, actor_user_id, action_type, count)
    VALUES (${options.day}::date, ${options.communityId}::uuid, ${options.actorUserId}::uuid,
      ${options.actionType}::moderator_action_types, ${options.count})
  `)
}

export async function readTestReportingSourceChanges(
  day: string,
  sourceType: string,
): Promise<number> {
  const { rows } = await write<{ count: number }>(sql`/* readTestReportingSourceChanges */
    SELECT count(*)::int AS count FROM reporting_source_changes
    WHERE source_day = ${day}::date AND source_type = ${sourceType}::reporting_source_change_types
  `)
  return rows[0]!.count
}

export async function readTestGrowthAuthor(day: string, authorId: string): Promise<boolean> {
  const { rows } = await write(sql`/* readTestGrowthAuthor */
    SELECT author_user_id FROM growth_metrics_daily_post_authors
    WHERE day = ${day}::date AND author_user_id = ${authorId}
  `)
  return rows.length === 1
}

export async function recomputeTestGrowthDay(day: string): Promise<void> {
  await runWithTransaction(undefined, query => recomputeGrowthDay(day, query))
}

export async function insertTestHistoricalReportingFollow(
  subjectId: string,
  objectId: string,
  createdAt: Date,
): Promise<void> {
  await write(sql`/* insertTestHistoricalReportingFollow */
    INSERT INTO relation__user__follow__user(subject_id, object_id, created_at)
    VALUES (${subjectId}, ${objectId}, ${createdAt})
  `)
}

export async function readTestReportingSourceChangeId(
  day: string,
  sourceType: string,
  after: Date,
): Promise<string | undefined> {
  const { rows } = await write<{ id: string }>(sql`/* readTestReportingSourceChangeId */
    SELECT id FROM reporting_source_changes WHERE id > ${getMinUUIDv7ForDate(after)}
      AND source_day = ${day}::date AND source_type = ${sourceType}::reporting_source_change_types
    ORDER BY id DESC LIMIT 1
  `)
  return rows[0]?.id
}

export function reportingTestWorkerConnection() {
  return { connection: workerQueueConnection, prefix: workerQueuePrefix }
}

export async function readTestModeratorWorkloadActor(
  day: string,
  communityId: string,
  actorId: string,
) {
  const { rows } = await write<{
    action_type: string
    count: number
  }>(sql`/* readTestModeratorWorkloadActor */
    SELECT action_type::text, count::int FROM moderator_workload_daily_totals
    WHERE day = ${day}::date AND community_id = ${communityId} AND actor_user_id = ${actorId}
    ORDER BY action_type
  `)
  return rows
}

export async function insertTestReportingRemovalsBefore(
  actorId: string,
  communityId: string,
  before: Date,
) {
  const ids = Array.from({ length: 50 }, (_, index) => v7({ msecs: before.getTime() - index - 1 }))
  await write(sql`/* insertTestReportingRemovalsBefore */
    INSERT INTO moderator_actions(id, actor_user_id, community_id, action_type)
    SELECT id, ${actorId}, ${communityId}, 'remove' FROM unnest(${ids}::uuid[]) id
  `)
}
