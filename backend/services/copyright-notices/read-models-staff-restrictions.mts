import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { groupByNotice } from './read-models-staff-group.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

export async function selectStaffRestrictions(
  noticeIds: readonly string[],
  query: TransactionQuery,
): Promise<Map<string, CopyrightStaffCase['restrictions']>> {
  const { rows } = await query<{
    copyright_notice_id: string
    id: string
    target_id: string
    imposed_at: Date
    lifted_at: Date | null
    human_reviewed_at: Date | null
    human_review_action: 'confirm' | 'reverse' | null
  }>(sql`/* getPendingCopyrightStaffCase:restrictions */
    SELECT target.copyright_notice_id, restriction.id, restriction.copyright_notice_target_id AS target_id, restriction.imposed_at,
      restriction.lifted_at, restriction.human_reviewed_at, restriction.human_review_action
    FROM copyright_restrictions restriction JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ANY(${noticeIds}::uuid[]) ORDER BY restriction.id
  `)
  return groupByNotice(
    rows.map(row => ({
      copyright_notice_id: row.copyright_notice_id,
      id: row.id,
      target_id: row.target_id,
      imposed_at: row.imposed_at,
      status: (row.lifted_at
        ? 'lifted'
        : row.human_reviewed_at
          ? row.human_review_action === 'reverse'
            ? 'reversed'
            : 'confirmed'
          : 'pending_review') as CopyrightStaffCase['restrictions'][number]['status'],
    })),
  )
}
