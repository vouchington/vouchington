import type { Job } from 'glide-mq'
import { v7 } from 'uuid'
import { getMinUuidv7ForDate } from '@modules/utils'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { recomputeGrowthDay } from '@services/reporting-daily-rollups/recompute-growth'
import { beginTransaction, runWithTransaction, write } from '@data-stores/psql'
import { findNextReportingSourceDay } from '@services/reporting-daily-rollups/initialize'
import { backgroundQueue } from './shared-background-queue.mts'
import { readAllQueueJobs } from './queue-jobs.mts'
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

export async function readTestReportingSourceDayEvents(
  day: string,
  sourceType: string,
): Promise<number> {
  const { rows } = await write<{ count: number }>(sql`/* readTestReportingSourceDayEvents */
    SELECT count(*)::int AS count FROM reporting_source_day_events
    WHERE source_on = ${day}::date AND source_type = ${sourceType}::reporting_source_day_event_types
  `)
  return rows[0]!.count
}

export async function readTestGrowthAuthor(day: string, authorId: string): Promise<boolean> {
  const { rows } = await write(sql`/* readTestGrowthAuthor */
    SELECT authors.author_user_id FROM growth_metric_daily_post_authors authors
    JOIN growth_metric_daily_totals totals ON totals.id = authors.growth_metric_daily_total_id
    WHERE totals.day = ${day}::date AND authors.author_user_id = ${authorId}
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

export async function readTestReportingSourceDayEventId(
  day: string,
  sourceType: string,
  after: Date,
): Promise<string | undefined> {
  const { rows } = await write<{ id: string }>(sql`/* readTestReportingSourceDayEventId */
    SELECT id FROM reporting_source_day_events WHERE id > ${getMinUuidv7ForDate(after)}
      AND source_on = ${day}::date AND source_type = ${sourceType}::reporting_source_day_event_types
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

/** Only this transaction's future action is added; disposal rolls it back. */
export async function inspectFutureReportingSourceDays(actorId: string, communityId: string) {
  await using transaction = await beginTransaction()
  const notBefore = new Date('3000-01-01T00:00:00.000Z')
  await transaction(sql`/* seedFutureReportingSourceDay */
    INSERT INTO moderator_actions(id, actor_user_id, community_id, action_type)
    VALUES (${v7({ msecs: notBefore.getTime() + 86400000 })}, ${actorId}, ${communityId}, 'approve')
  `)
  const { rows } = await transaction<{ today: string }>(sql`/* currentReportingSourceDay */
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS today
  `)
  return {
    today: rows[0]!.today,
    growth: await findNextReportingSourceDay('growth', notBefore, transaction),
    workload: await findNextReportingSourceDay('moderator_workload', notBefore, transaction),
  }
}

export async function readTestReportingJobsByRevision(revision: string) {
  return (await readAllQueueJobs(backgroundQueue)).filter(
    (job): job is Job<Record<string, unknown>> =>
      typeof job.data === 'object' &&
      job.data !== null &&
      'revision' in job.data &&
      job.data.revision === revision,
  )
}

export async function readTestGrowthTotalId(day: string): Promise<string | undefined> {
  const { rows } = await write<{ id: string }>(sql`/* readTestGrowthTotalId */
    SELECT id FROM growth_metric_daily_totals WHERE day = ${day}::date
  `)
  return rows[0]?.id
}
