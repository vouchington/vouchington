import type { TransactionQuery } from '@data-stores/psql'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import sql from 'sql-template-strings'
import { heavyFollowUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const fixtureUserIds = Array.from({ length: 880 }, (_, i) => seedUuid(i + 8_000, '01'))

export async function seedCommunityBanReportCapacity(
  query: TransactionQuery,
  communityIds: string[],
) {
  const { rows: insertedCases } = await query<{ id: string; reported_user_id: string }>(sql`
    /* seedCommunityPublicationCapacity:banCases */
    INSERT INTO moderation_cases (reported_user_id)
    SELECT user_id FROM unnest(${fixtureUserIds}::uuid[]) AS fixture(user_id)
    RETURNING id, reported_user_id
  `)
  const casesByUser = new Map(insertedCases.map(row => [row.reported_user_id, row.id]))
  const { rows: banReports } = await query<{ id: string; community_id: string }>(sql`
    /* seedCommunityPublicationCapacity:banReports */
    WITH members AS (
      INSERT INTO community_members (community_id, user_id, role, suspected_ban_evader_at,
        suspected_ban_evader_source_user_id, suspected_ban_evader_score)
      SELECT community_id, user_id, 'member', CURRENT_TIMESTAMP, ${heavyFollowUser.id}, 0.9
      FROM unnest(${fixtureUserIds}::uuid[]) WITH ORDINALITY AS fixture(user_id, n)
      JOIN unnest(${communityIds}::uuid[]) WITH ORDINALITY AS community(community_id, ordinal)
        ON ordinal = CASE WHEN n <= 160 THEN 1 ELSE 2 + (n - 161) % (cardinality(${communityIds}::uuid[]) - 1) END
      RETURNING community_id, user_id
    )
    INSERT INTO moderation_reports (id, community_id, reported_user_id, case_id, reporter_user_id, reason, original_reason, created_via)
    SELECT uuidv7(-(n * interval '1 minute') + interval '30 seconds'), community_id, user_id,
      case_id, (SELECT id FROM users WHERE username = ${BAN_EVASION_SYSTEM_USERNAME}), 'other', 'other', 'system'
    FROM members JOIN unnest(${fixtureUserIds}::uuid[], ${fixtureUserIds.map(id => casesByUser.get(id)!)}::uuid[])
      WITH ORDINALITY AS fixture(user_id, case_id, n) USING (user_id)
    RETURNING id, community_id
  `)
  return {
    banReports,
    caseIds: insertedCases.map(row => row.id),
    memberCount: fixtureUserIds.length,
  }
}
