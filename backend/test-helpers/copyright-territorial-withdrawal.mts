import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import {
  withdrawCopyrightJurisdictionPolicyApproval,
  type CopyrightJurisdictionPolicyApproval,
} from '../services/copyright-notices/jurisdiction-policy.mts'

/** Isolated-case setup: no approval may remain available for a later intake. */
export async function withdrawAllTestTerritorialApprovals(
  administrator: PrivateUser,
  jurisdiction: CopyrightJurisdictionPolicyApproval['jurisdiction'],
): Promise<number> {
  const { rows } = await read<{ id: string }>(sql`/* withdrawAllTestTerritorialApprovals */
    SELECT approval.id FROM copyright_jurisdiction_policy_approvals approval
    WHERE approval.jurisdiction = ${jurisdiction}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_jurisdiction_policy_withdrawals withdrawal
        WHERE withdrawal.copyright_jurisdiction_policy_approval_id = approval.id
      )
    ORDER BY approval.approved_at, approval.id`)
  for (const approval of rows) {
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id)
  }
  return rows.length
}
