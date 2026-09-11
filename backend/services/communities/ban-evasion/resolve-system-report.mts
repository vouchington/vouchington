import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import { maybeResolveCases } from '@services/moderation-cases'
import { recordModeratorActions } from '@services/moderator-actions'

export async function resolveBanEvasionSystemReports(
  resolvedById: string,
  communityId: string,
  userId: string,
  resolutionAction: 'actioned' | 'dismissed',
): Promise<void> {
  await using query = await beginTransaction()

  const { rows } = await write<{ id: string; case_id: string | null }>(
    sql`/* resolveBanEvasionSystemReports */
        UPDATE moderation_reports
        SET reviewed_at = CURRENT_TIMESTAMP,
            resolution_action = ${resolutionAction},
            resolved_by_id = ${resolvedById}
        WHERE reported_user_id = ${userId}
          AND reporter_user_id = (
            SELECT id FROM users WHERE username = ${BAN_EVASION_SYSTEM_USERNAME} LIMIT 1
          )
          AND reviewed_at IS NULL
        RETURNING id, case_id
      `,
    { query },
  )
  if (rows.length > 0) {
    await recordModeratorActions(
      resolvedById,
      rows.map(row => ({
        actionType: resolutionAction === 'dismissed' ? 'dismiss_report' : 'resolve_report',
        communityId,
        reportId: row.id,
      })),
      { query },
    )

    const caseIds = [...new Set(rows.flatMap(row => (row.case_id ? [row.case_id] : [])))]
    await maybeResolveCases(caseIds, resolvedById, { query })
  }

  await query.commit()
}
