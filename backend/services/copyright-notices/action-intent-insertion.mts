import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CopyrightActionIntentRecord } from './types.mts'

/** Resolve a concurrent duplicate in a fresh statement without updating the existing intent. */
export async function insertCopyrightActionIntent(
  query: TransactionQuery,
  restrictionId: string,
  placementRevision: number,
  action: 'withhold' | 'restore',
): Promise<CopyrightActionIntentRecord> {
  await query(sql`/* insertCopyrightActionIntent */
    INSERT INTO copyright_notice_action_work_items (
      copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision, action
    ) VALUES (${restrictionId}, NULL, ${placementRevision}, ${action})
    ON CONFLICT (copyright_restriction_id, expected_placement_revision, action) DO NOTHING
  `)
  const { rows } = await query<CopyrightActionIntentRecord>(sql`
    /* insertCopyrightActionIntent:read */
    SELECT id, copyright_restriction_id, copyright_notice_deadline_id,
      expected_placement_revision, action, state, attempt_count, leased_at,
      completed_at, completed_at_reason, failure_message, available_at, lease_token
    FROM copyright_notice_action_work_items
    WHERE copyright_restriction_id = ${restrictionId}
      AND expected_placement_revision = ${placementRevision} AND action = ${action}
  `)
  const intent = rows[0]
  assert(intent, 500, 'Copyright action intent was not recorded')
  return intent
}
