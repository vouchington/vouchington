import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PendingModerationReport } from './pending-moderation-report.mts'
import type { CommunityBanEvasionContext } from './config.mts'

const REPORT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function attachBanEvasionContext(
  reports: PendingModerationReport[],
  options: { communityId?: string } = {},
): Promise<PendingModerationReport[]> {
  const userReports = reports.filter(r => r.entity_type === 'user' && r.is_system_generated)
  if (userReports.length === 0) return reports

  const storedCommunityIds = await readStoredReportCommunityIds(userReports)
  const userIds = userReports.map(r => r.entity_id)
  const query = sql`/* attachBanEvasionContext */
    SELECT
      cm.user_id,
      cm.community_id,
      c.slug AS community_slug,
      cm.suspected_ban_evader_source_user_id,
      cm.suspected_ban_evader_score,
      cm.suspected_ban_evader_at
    FROM community_members cm
    JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
    WHERE cm.user_id = ANY(${userIds}::uuid[])
      AND cm.suspected_ban_evader_at IS NOT NULL
      AND cm.suspected_ban_evader_dismissed_at IS NULL
      AND cm.removed_at IS NULL`
  if (options.communityId) {
    query.append(sql` AND cm.community_id = ${options.communityId}`)
  }
  query.append(sql` ORDER BY cm.suspected_ban_evader_at DESC`)
  const { rows } = await read<{
    user_id: string
    community_id: string
    community_slug: string
    suspected_ban_evader_source_user_id: string | null
    suspected_ban_evader_score: number | null
    suspected_ban_evader_at: Date
  }>(query)

  const flagsByUserAndCommunity = new Map<string, CommunityBanEvasionContext>()
  for (const row of rows) {
    const key = flagKey(row.user_id, row.community_id)
    if (!flagsByUserAndCommunity.has(key)) {
      flagsByUserAndCommunity.set(key, {
        community_id: row.community_id,
        community_slug: row.community_slug,
        source_user_id: row.suspected_ban_evader_source_user_id ?? '',
        source_username: null,
        score: row.suspected_ban_evader_score ?? 0,
        flagged_at: row.suspected_ban_evader_at.toISOString(),
      })
    }
  }

  return reports.map(report => {
    if (report.entity_type !== 'user' || !report.is_system_generated) return report
    const communityId = resolveReportCommunityId(report, storedCommunityIds, options.communityId)
    if (!communityId) return { ...report, community_ban_evasion: null }
    return {
      ...report,
      community_ban_evasion:
        flagsByUserAndCommunity.get(flagKey(report.entity_id, communityId)) ?? null,
    }
  })
}

async function readStoredReportCommunityIds(
  reports: PendingModerationReport[],
): Promise<Map<string, string | null>> {
  const reportIds = reports.reduce<string[]>((ids, report) => {
    if (REPORT_ID_PATTERN.test(report.id)) ids.push(report.id)
    return ids
  }, [])
  const stored = new Map<string, string | null>()
  if (reportIds.length === 0) return stored
  const { rows } = await read<{ id: string; community_id: string | null }>(sql`
    /* attachBanEvasionContext:report-communities */
    SELECT id, community_id
    FROM moderation_reports
    WHERE id = ANY(${reportIds}::uuid[])
  `)
  for (const row of rows) stored.set(row.id, row.community_id)
  return stored
}

function resolveReportCommunityId(
  report: PendingModerationReport,
  storedCommunityIds: Map<string, string | null>,
  fallbackCommunityId: string | undefined,
): string | null {
  if (storedCommunityIds.has(report.id)) return storedCommunityIds.get(report.id) ?? null
  if (report.community_id) return report.community_id
  return fallbackCommunityId ?? null
}

function flagKey(userId: string, communityId: string): string {
  return `${userId}:${communityId}`
}
