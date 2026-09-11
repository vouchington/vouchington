import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PendingModerationReport, CommunityBanEvasionContext } from './get.mts'

export async function attachBanEvasionContext(
  reports: PendingModerationReport[],
  options: { communityId?: string } = {},
): Promise<PendingModerationReport[]> {
  const userReports = reports.filter(r => r.entity_type === 'user' && r.is_system_generated)
  if (userReports.length === 0) return reports

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

  const flagsByUserId = new Map<string, CommunityBanEvasionContext>()
  for (const row of rows) {
    if (!flagsByUserId.has(row.user_id)) {
      flagsByUserId.set(row.user_id, {
        community_id: row.community_id,
        community_slug: row.community_slug,
        source_user_id: row.suspected_ban_evader_source_user_id ?? '',
        source_username: null,
        score: row.suspected_ban_evader_score ?? 0,
        flagged_at: row.suspected_ban_evader_at.toISOString(),
      })
    }
  }

  return reports.map(r => {
    if (r.entity_type !== 'user' || !r.is_system_generated) return r
    return {
      ...r,
      community_ban_evasion: flagsByUserId.get(r.entity_id) ?? null,
    }
  })
}
