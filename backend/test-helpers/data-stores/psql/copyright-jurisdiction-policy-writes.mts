import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  copyrightJurisdictionPolicyLockKey,
  lockCopyrightJurisdictionPolicy,
} from '../../../services/copyright-notices/jurisdiction-policy.mts'

export async function rejectUsJurisdictionPolicyApproval(): Promise<void> {
  await write(sql`/* rejectUsJurisdictionPolicyApproval */
    INSERT INTO copyright_jurisdiction_policy_approvals (jurisdiction, policy_version)
    VALUES ('us_dmca', 'us-dmca')
  `)
}

export async function rejectEuReceiptForUsNotice(): Promise<void> {
  const version = `eu-${randomUUID().replaceAll('-', '').slice(0, 12)}`
  await using transaction = await beginTransaction()
  await lockCopyrightJurisdictionPolicy('eu_dsa', transaction)
  const { rows } = await transaction<{
    approval_id: string
    notice_id: string
    user_id: string
  }>(sql`/* rejectEuReceiptForUsNotice:notice */
    WITH actor AS (
      INSERT INTO users DEFAULT VALUES RETURNING id
    ), approval AS (
      INSERT INTO copyright_jurisdiction_policy_approvals (
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
  await transaction.commit()
  await write(sql`/* rejectEuReceiptForUsNotice */
    INSERT INTO copyright_territorial_notice_receipts (
      copyright_notice_id, jurisdiction, copyright_jurisdiction_policy_approval_id,
      requester_user_id, requester_identity_sha256, idempotency_key, request_sha256,
      hosted_use_url, grounds_ciphertext, notifier_email_ciphertext, has_good_faith_statement
    ) VALUES (
      ${fixture.notice_id}, 'eu_dsa', ${fixture.approval_id}, ${fixture.user_id}, ${randomBytes(32)},
      ${randomUUID()}, ${randomBytes(32)}, 'https://example.test/us', 'grounds',
      'notifier@example.test', TRUE
    )
  `)
}

/** Commits a jurisdiction approval only when no other transaction holds that jurisdiction's
 * policy lock. Returns false without writing when the lock is already held. */
export async function tryCommitCopyrightJurisdictionPolicyApproval(
  jurisdiction: 'eu_dsa' | 'uk',
  policyVersion: string,
  actorId: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const lockKey = copyrightJurisdictionPolicyLockKey(jurisdiction)
  const { rows } = await transaction<{ acquired: boolean }>(sql`
    /* tryCommitCopyrightJurisdictionPolicyApproval:lock */
    SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS acquired
  `)
  if (!rows[0]?.acquired) {
    await transaction.rollback()
    return false
  }
  await transaction(sql`/* tryCommitCopyrightJurisdictionPolicyApproval */
    INSERT INTO copyright_jurisdiction_policy_approvals (
      jurisdiction, policy_version, approved_by_id
    ) VALUES (${jurisdiction}, ${policyVersion}, ${actorId})
  `)
  await transaction.commit()
  return true
}
