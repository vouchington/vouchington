import { beginTransaction, read, withTransactionOptions } from '@data-stores/psql'
import type { QueryExecutor, QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import {
  assertPolicyVersion,
  territorialCopyrightUnavailableMessage,
  type TerritorialCopyrightJurisdiction,
} from './territorial-fields.mts'

type CopyrightJurisdictionPolicyApproval = {
  id: string
  jurisdiction: TerritorialCopyrightJurisdiction
  policy_version: string
}

export function currentUserCanApproveCopyrightJurisdictionPolicy(
  currentUser: PrivateUser | null,
): boolean {
  return currentUser?.roles?.includes('administrator') === true
}

function currentCopyrightJurisdictionPolicySql(
  jurisdiction: TerritorialCopyrightJurisdiction,
  approvalIds?: readonly string[],
) {
  return sql`/* currentCopyrightJurisdictionPolicy */
    SELECT approval.id, approval.jurisdiction, approval.policy_version
    FROM copyright_jurisdiction_policy_approvals approval
    WHERE approval.jurisdiction = ${jurisdiction}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_jurisdiction_policy_withdrawals withdrawal
        WHERE withdrawal.copyright_jurisdiction_policy_approval_id = approval.id
      )
  `.append(approvalIds ? sql` AND approval.id = ANY(${approvalIds}::uuid[])` : sql``).append(sql`
    ORDER BY approval.approved_at DESC, approval.id DESC LIMIT 1`)
}

export async function findCurrentCopyrightJurisdictionPolicy(
  jurisdiction: TerritorialCopyrightJurisdiction,
  query: QueryExecutor = read,
  approvalIds?: readonly string[],
): Promise<CopyrightJurisdictionPolicyApproval | null> {
  const { rows } = await query<CopyrightJurisdictionPolicyApproval>(
    currentCopyrightJurisdictionPolicySql(jurisdiction, approvalIds),
  )
  return rows[0] ?? null
}

export async function getCopyrightJurisdictionAvailability(): Promise<{
  eu_dsa: boolean
  uk: boolean
}> {
  const { rows } = await read<{ jurisdiction: TerritorialCopyrightJurisdiction }>(sql`
    /* getCopyrightJurisdictionAvailability */
    SELECT territory.jurisdiction
    FROM unnest(ARRAY['eu_dsa', 'uk']::copyright_jurisdictions[]) AS territory(jurisdiction)
    WHERE EXISTS (
      SELECT 1 FROM copyright_jurisdiction_policy_approvals approval
      WHERE approval.jurisdiction = territory.jurisdiction
        AND NOT EXISTS (
          SELECT 1 FROM copyright_jurisdiction_policy_withdrawals withdrawal
          WHERE withdrawal.copyright_jurisdiction_policy_approval_id = approval.id
        )
    )
  `)
  const available = new Set(rows.map(row => row.jurisdiction))
  return { eu_dsa: available.has('eu_dsa'), uk: available.has('uk') }
}

export async function requireCurrentCopyrightJurisdictionPolicy(
  jurisdiction: TerritorialCopyrightJurisdiction,
  transaction: TransactionQuery,
  approvalIds?: readonly string[],
): Promise<CopyrightJurisdictionPolicyApproval> {
  const { rows } = await transaction<CopyrightJurisdictionPolicyApproval>(
    currentCopyrightJurisdictionPolicySql(jurisdiction, approvalIds),
  )
  const approval = rows[0]
  assert(approval, 403, territorialCopyrightUnavailableMessage(jurisdiction))
  return approval
}

export async function recordCopyrightJurisdictionPolicyApproval(
  currentUser: PrivateUser,
  input: { jurisdiction: TerritorialCopyrightJurisdiction; policyVersion: string },
): Promise<CopyrightJurisdictionPolicyApproval> {
  assert(currentUserCanApproveCopyrightJurisdictionPolicy(currentUser), 403, 'Forbidden')
  const policyVersion = assertPolicyVersion(input.policyVersion)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<CopyrightJurisdictionPolicyApproval>(
    sql`/* recordCopyrightJurisdictionPolicyApproval */
    INSERT INTO copyright_jurisdiction_policy_approvals (
      jurisdiction, policy_version, approved_by_id
    ) VALUES (
      ${input.jurisdiction}, ${policyVersion}, ${currentUser.id}
    )
    ON CONFLICT (jurisdiction, policy_version) DO NOTHING
    RETURNING id, jurisdiction, policy_version
  `,
  )
  const approval = rows[0]
  assert(approval, 409, 'That policy version is already recorded')
  await transaction.commit()
  return approval
}

export async function withdrawCopyrightJurisdictionPolicyApproval(
  currentUser: PrivateUser,
  approvalId: string,
  options: QueryOptions = {},
): Promise<{ id: string }> {
  assert(currentUserCanApproveCopyrightJurisdictionPolicy(currentUser), 403, 'Forbidden')
  if (options.query || options.client) return withTransactionOptions(options, execute)
  await using ownedTransaction = await beginTransaction()
  const result = await execute(ownedTransaction)
  await ownedTransaction.commit()
  return result

  async function execute(transaction: TransactionQuery) {
    const { rows: approvals } = await transaction<{ id: string }>(
      sql`/* withdrawCopyrightJurisdictionPolicyApproval:approval */
    SELECT approval.id
    FROM copyright_jurisdiction_policy_approvals approval
    WHERE approval.id = ${approvalId}
  `,
    )
    assert(approvals[0], 404, 'Copyright policy approval not found')
    const { rows } = await transaction<{ id: string }>(
      sql`/* withdrawCopyrightJurisdictionPolicyApproval */
    INSERT INTO copyright_jurisdiction_policy_withdrawals (
      copyright_jurisdiction_policy_approval_id, withdrawn_by_id
    ) VALUES (${approvalId}, ${currentUser.id})
    ON CONFLICT (copyright_jurisdiction_policy_approval_id) DO NOTHING
    RETURNING id
  `,
    )
    const withdrawal = rows[0]
    assert(withdrawal, 409, 'Copyright policy approval is already withdrawn')
    return withdrawal
  }
}
