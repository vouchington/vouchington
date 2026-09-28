import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import {
  assertPolicyVersion,
  territorialCopyrightUnavailableMessage,
  type TerritorialCopyrightJurisdiction,
} from './territorial-fields.mts'

export type CopyrightTerritorialPolicyApproval = {
  id: string
  jurisdiction: TerritorialCopyrightJurisdiction
  policy_version: string
}

export function currentUserCanApproveCopyrightTerritorialPolicy(
  currentUser: PrivateUser | null,
): boolean {
  return currentUser?.roles?.includes('administrator') === true
}

export async function lockCurrentCopyrightTerritorialPolicy(
  jurisdiction: TerritorialCopyrightJurisdiction,
  transaction: TransactionQuery,
): Promise<CopyrightTerritorialPolicyApproval> {
  const { rows } = await transaction<CopyrightTerritorialPolicyApproval>(
    sql`/* lockCurrentCopyrightTerritorialPolicy */
    SELECT approval.id, approval.jurisdiction, approval.policy_version
    FROM copyright_territorial_policy_approvals approval
    WHERE approval.jurisdiction = ${jurisdiction}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_territorial_policy_withdrawals withdrawal
        WHERE withdrawal.copyright_territorial_policy_approval_id = approval.id
      )
    ORDER BY approval.approved_at DESC, approval.id DESC
    LIMIT 1
    FOR UPDATE OF approval
  `,
  )
  const approval = rows[0]
  assert(approval, 403, territorialCopyrightUnavailableMessage(jurisdiction))
  return approval
}

export async function recordCopyrightTerritorialPolicyApproval(
  currentUser: PrivateUser,
  input: { jurisdiction: TerritorialCopyrightJurisdiction; policyVersion: string },
): Promise<CopyrightTerritorialPolicyApproval> {
  assert(currentUserCanApproveCopyrightTerritorialPolicy(currentUser), 403, 'Forbidden')
  const policyVersion = assertPolicyVersion(input.policyVersion)
  await using transaction = await beginTransaction()
  const { rows: existing } = await transaction<{ id: string }>(
    sql`/* recordCopyrightTerritorialPolicyApproval:existing */
    SELECT id FROM copyright_territorial_policy_approvals
    WHERE jurisdiction = ${input.jurisdiction} AND policy_version = ${policyVersion}
  `,
  )
  assert(!existing[0], 409, 'That policy version is already recorded')
  const { rows } = await transaction<CopyrightTerritorialPolicyApproval>(
    sql`/* recordCopyrightTerritorialPolicyApproval */
    INSERT INTO copyright_territorial_policy_approvals (
      jurisdiction, policy_version, approved_by_id
    ) VALUES (
      ${input.jurisdiction}, ${policyVersion}, ${currentUser.id}
    )
    RETURNING id, jurisdiction, policy_version
  `,
  )
  const approval = rows[0]
  assert(approval, 500, 'Failed to record copyright policy approval')
  await transaction.commit()
  return approval
}

export async function withdrawCopyrightTerritorialPolicyApproval(
  currentUser: PrivateUser,
  approvalId: string,
): Promise<{ id: string }> {
  assert(currentUserCanApproveCopyrightTerritorialPolicy(currentUser), 403, 'Forbidden')
  await using transaction = await beginTransaction()
  const { rows: approvals } = await transaction<{ id: string }>(
    sql`/* withdrawCopyrightTerritorialPolicyApproval:lock */
    SELECT approval.id
    FROM copyright_territorial_policy_approvals approval
    WHERE approval.id = ${approvalId}
    FOR UPDATE
  `,
  )
  assert(approvals[0], 404, 'Copyright policy approval not found')
  const { rows: withdrawals } = await transaction<{ id: string }>(
    sql`/* withdrawCopyrightTerritorialPolicyApproval:existing */
    SELECT id FROM copyright_territorial_policy_withdrawals
    WHERE copyright_territorial_policy_approval_id = ${approvalId}
  `,
  )
  assert(!withdrawals[0], 409, 'Copyright policy approval is already withdrawn')
  const { rows } = await transaction<{ id: string }>(
    sql`/* withdrawCopyrightTerritorialPolicyApproval */
    INSERT INTO copyright_territorial_policy_withdrawals (
      copyright_territorial_policy_approval_id, withdrawn_by_id
    ) VALUES (${approvalId}, ${currentUser.id})
    RETURNING id
  `,
  )
  const withdrawal = rows[0]
  assert(withdrawal, 500, 'Failed to withdraw copyright policy approval')
  await transaction.commit()
  return withdrawal
}
