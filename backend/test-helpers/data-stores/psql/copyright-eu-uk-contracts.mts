import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type CopyrightTerritorialContractShape = {
  accepted_at: Date | null
  provisional_withholding_at: Date | null
  jurisdiction: string
  deadline_count: number
  target_count: number
  lifecycle_event_count: number
  eu_receipt_count: number
  uk_receipt_count: number
  eu_statement_count: number
  uk_review_count: number
}

export async function readCopyrightTerritorialContractShape(
  noticeId: string,
): Promise<CopyrightTerritorialContractShape> {
  const { rows } = await read<CopyrightTerritorialContractShape>(
    sql`/* readCopyrightTerritorialContractShape */
    SELECT notice.accepted_at, notice.provisional_withholding_at, notice.jurisdiction,
      (SELECT count(*)::integer FROM copyright_notice_deadlines deadline
        WHERE deadline.copyright_notice_id = notice.id) AS deadline_count,
      (SELECT count(*)::integer FROM copyright_notice_targets target
        WHERE target.copyright_notice_id = notice.id) AS target_count,
      (SELECT count(*)::integer FROM copyright_notice_lifecycle_events event
        WHERE event.copyright_notice_id = notice.id) AS lifecycle_event_count,
      (SELECT count(*)::integer FROM copyright_eu_notice_receipts receipt
        WHERE receipt.copyright_notice_id = notice.id) AS eu_receipt_count,
      (SELECT count(*)::integer FROM copyright_uk_notice_receipts receipt
        WHERE receipt.copyright_notice_id = notice.id) AS uk_receipt_count,
      (SELECT count(*)::integer FROM copyright_eu_statements_of_reasons statement
        WHERE statement.copyright_notice_id = notice.id) AS eu_statement_count,
      (SELECT count(*)::integer FROM copyright_uk_reviews review
        WHERE review.copyright_notice_id = notice.id) AS uk_review_count
    FROM copyright_notices notice
    WHERE notice.id = ${noticeId}
  `,
  )
  const shape = rows[0]
  if (!shape) throw new Error(`Missing copyright notice ${noticeId}`)
  return shape
}

export async function readTerritorialClockColumnNames(): Promise<string[]> {
  const { rows } = await read<{ column_name: string }>(sql`/* readTerritorialClockColumnNames */
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        table_name LIKE 'copyright_eu_%'
        OR table_name LIKE 'copyright_uk_%'
        OR table_name = 'copyright_territorial_policy_approvals'
        OR table_name = 'copyright_territorial_policy_withdrawals'
      )
      AND column_name IN (
        'earliest_restoration_at',
        'escalation_at',
        'restoration_deadline_at',
        'metadata'
      )
  `)
  return rows.map(row => row.column_name)
}

export async function countTerritorialContractTables(): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTerritorialContractTables */
    SELECT count(*)::integer AS count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (
      'copyright_territorial_policy_approvals',
      'copyright_eu_notice_receipts',
      'copyright_eu_statements_of_reasons',
      'copyright_eu_redress_requests',
      'copyright_eu_supervised_complaints',
      'copyright_eu_transparency_reports',
      'copyright_uk_notice_receipts',
      'copyright_uk_reviews',
      'copyright_uk_redress_requests'
    )
  `)
  return rows[0]?.count ?? 0
}

export async function rejectUsTerritorialPolicyApproval(): Promise<void> {
  await write(sql`/* rejectUsTerritorialPolicyApproval */
    INSERT INTO copyright_territorial_policy_approvals (jurisdiction, policy_version)
    VALUES ('us_dmca', 'us-dmca')
  `)
}

export async function rejectEuReceiptForUsNotice(): Promise<void> {
  const version = `eu-${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const { rows } = await write<{
    approval_id: string
    notice_id: string
    user_id: string
  }>(sql`/* rejectEuReceiptForUsNotice:notice */
    WITH actor AS (
      INSERT INTO users DEFAULT VALUES RETURNING id
    ), approval AS (
      INSERT INTO copyright_territorial_policy_approvals (
        jurisdiction, policy_version, approved_by_id
      )
      SELECT 'eu_dsa', ${version}, id FROM actor
      RETURNING id
    ), notice AS (
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description,
        policy_version
      ) VALUES (
        'us_dmca', 'copyright', CURRENT_TIMESTAMP, 'contact', 'work', 'test-v1'
      )
      RETURNING id
    )
    SELECT actor.id AS user_id, approval.id AS approval_id, notice.id AS notice_id
    FROM actor, approval, notice
  `)
  const fixture = rows[0]
  if (!fixture) throw new Error('missing US notice fixture')
  await write(sql`/* rejectEuReceiptForUsNotice */
    INSERT INTO copyright_eu_notice_receipts (
      copyright_notice_id, copyright_territorial_policy_approval_id, requester_user_id,
      idempotency_key, request_sha256, hosted_use_url, grounds_ciphertext
    ) VALUES (
      ${fixture.notice_id}, ${fixture.approval_id}, ${fixture.user_id}, ${randomUUID()},
      ${randomBytes(32)}, 'https://example.test/us', 'grounds'
    )
  `)
}

export async function concealTerritorialPolicyApprovals(
  transaction: TransactionQuery,
  jurisdiction: 'eu_dsa' | 'uk',
  actorId: string,
): Promise<void> {
  await transaction(sql`/* concealTerritorialPolicyApprovals */
    INSERT INTO copyright_territorial_policy_withdrawals (
      copyright_territorial_policy_approval_id, withdrawn_by_id
    )
    SELECT approval.id, ${actorId}
    FROM copyright_territorial_policy_approvals approval
    WHERE approval.jurisdiction = ${jurisdiction}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_territorial_policy_withdrawals withdrawal
        WHERE withdrawal.copyright_territorial_policy_approval_id = approval.id
      )
  `)
}

export async function insertTerritorialPolicyApproval(
  transaction: TransactionQuery,
  jurisdiction: 'eu_dsa' | 'uk',
  policyVersion: string,
  actorId: string,
): Promise<string> {
  const { rows } = await transaction<{ id: string }>(sql`/* insertTerritorialPolicyApproval */
    INSERT INTO copyright_territorial_policy_approvals (
      jurisdiction, policy_version, approved_by_id
    ) VALUES (${jurisdiction}, ${policyVersion}, ${actorId})
    RETURNING id
  `)
  const approval = rows[0]
  if (!approval) throw new Error('missing territorial policy approval')
  return approval.id
}

export async function insertTerritorialPolicyWithdrawal(
  transaction: TransactionQuery,
  approvalId: string,
  actorId: string,
): Promise<void> {
  await transaction(sql`/* insertTerritorialPolicyWithdrawal */
    INSERT INTO copyright_territorial_policy_withdrawals (
      copyright_territorial_policy_approval_id, withdrawn_by_id
    ) VALUES (${approvalId}, ${actorId})
  `)
}

/** Runs territorial setup inside a transaction and always rolls it back, so a temporary policy
 * approval cannot enable EU or UK intake for later tests. */
export async function withRolledBackTerritorialTransaction<Result>(
  run: (transaction: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.rollback()
  return result
}
