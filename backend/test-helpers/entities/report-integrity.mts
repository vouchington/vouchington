import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestReportIntegrityFlag = {
  id: string
  post_id: string | null
  reported_user_id: string | null
  hostname_id: string | null
  rss_feed_item_id: string | null
  flag_type: string
  reporter_count: number
  new_account_reporter_pct: number
  resolved_at: Date | null
  resolution: string | null
}

export type TestReportAbusePenalty = {
  id: string
  user_id: string
  reason: string
  source_flag_id: string | null
  revoked_at: Date | null
}

export async function getTestReportIntegrityFlagsByPostId(
  postId: string,
): Promise<TestReportIntegrityFlag[]> {
  const { rows } = await read(sql`/* getTestReportIntegrityFlagsByPostId */
    SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id,
           flag_type, reporter_count, new_account_reporter_pct, resolved_at, resolution
    FROM report_integrity_flags
    WHERE post_id = ${postId}
    ORDER BY id DESC
  `)
  return rows as TestReportIntegrityFlag[]
}

export async function getTestReportIntegrityFlagsByUserId(
  reportedUserId: string,
): Promise<TestReportIntegrityFlag[]> {
  const { rows } = await read(sql`/* getTestReportIntegrityFlagsByUserId */
    SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id,
           flag_type, reporter_count, new_account_reporter_pct, resolved_at, resolution
    FROM report_integrity_flags
    WHERE reported_user_id = ${reportedUserId}
    ORDER BY id DESC
  `)
  return rows as TestReportIntegrityFlag[]
}

export async function getTestReportAbusePenaltiesByFlagId(
  flagId: string,
): Promise<TestReportAbusePenalty[]> {
  const { rows } = await read(sql`/* getTestReportAbusePenaltiesByFlagId */
    SELECT id, user_id, reason, source_flag_id, revoked_at
    FROM report_abuse_penalties
    WHERE source_flag_id = ${flagId}
    ORDER BY id DESC
  `)
  return rows as TestReportAbusePenalty[]
}

export async function getTestReportAbusePenaltiesByUserId(
  userId: string,
): Promise<TestReportAbusePenalty[]> {
  const { rows } = await read(sql`/* getTestReportAbusePenaltiesByUserId */
    SELECT id, user_id, reason, source_flag_id, revoked_at
    FROM report_abuse_penalties
    WHERE user_id = ${userId}
    ORDER BY id DESC
  `)
  return rows as TestReportAbusePenalty[]
}

export async function getTestUserBadFaithReporterAt(userId: string): Promise<Date | null> {
  const { rows } = await read(sql`/* getTestUserBadFaithReporterAt */
    SELECT bad_faith_reporter_at
    FROM users
    WHERE id = ${userId}
  `)
  const row = rows[0] as { bad_faith_reporter_at: Date | null } | undefined
  return row?.bad_faith_reporter_at ?? null
}

export async function insertTestReportAbusePenalty(options: {
  userId: string
  createdById: string
  sourceFlagId?: string
  revokedAt?: Date
  revokedById?: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertTestReportAbusePenalty */
    INSERT INTO report_abuse_penalties
      (user_id, reason, source_flag_id, created_by_id, revoked_at, revoked_by_id)
    VALUES (
      ${options.userId},
      'mass_report_campaign',
      ${options.sourceFlagId ?? null}::uuid,
      ${options.createdById},
      ${options.revokedAt ?? null},
      ${options.revokedById ?? null}::uuid
    )
    RETURNING id
  `)
  return rows[0]!.id
}

export async function insertTestReportIntegrityFlag(options: {
  postId?: string
  reportedUserId?: string
  hostnameId?: string
  rssId?: string
  reporterCount?: number
  newAccountReporterPct?: number
  reporterUserIds?: string[]
  resolvedAt?: Date | null
  resolution?: string | null
}): Promise<string> {
  const {
    postId = null,
    reportedUserId = null,
    hostnameId = null,
    rssId = null,
    reporterCount = 5,
    newAccountReporterPct = 0.6,
    reporterUserIds = [],
    resolvedAt = null,
    resolution = null,
  } = options

  const details = JSON.stringify({ reporter_user_ids: reporterUserIds })

  const { rows } = await write<{ id: string }>(sql`/* insertTestReportIntegrityFlag */
    INSERT INTO report_integrity_flags
      (post_id, reported_user_id, hostname_id, rss_feed_item_id,
       flag_type, reporter_count, new_account_reporter_pct, details, resolved_at, resolution)
    VALUES (
      ${postId}::uuid,
      ${reportedUserId}::uuid,
      ${hostnameId}::uuid,
      ${rssId}::uuid,
      'mass_report_suspected',
      ${reporterCount},
      ${newAccountReporterPct},
      ${details}::jsonb,
      ${resolvedAt === undefined ? null : resolvedAt},
      ${resolution === undefined ? null : resolution}
    )
    RETURNING id
  `)
  return rows[0]!.id
}
