import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'

import type { MembershipPurchaseIntentFixture } from './membership-purchase-intents.mts'

type WriteResult = { rowCount: number | null }

export async function createMembershipProviderEvidence(
  fixture: MembershipPurchaseIntentFixture,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipVerificationEvidence */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, evidence_lookup_sha256, encrypted_evidence
    ) VALUES ('stripe', 'test', ${fixture.applicationId},
      ${randomUUID().replaceAll('-', '').padEnd(64, 'b')}, '\x01'::bytea) RETURNING id`)
  return rows[0]!.id
}

export async function createMembershipVerification(
  fixture: MembershipPurchaseIntentFixture,
  intentId: string,
  evidenceId: string,
  idempotencyKey: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipVerification */
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
      membership_provider_evidence_record_id, provider, environment, application_id
    ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint}, ${intentId}, ${evidenceId},
      'stripe', 'test', ${fixture.applicationId}) RETURNING id`)
  return rows[0]!.id
}

export function createDuplicateMembershipVerification(
  fixture: MembershipPurchaseIntentFixture,
  evidenceId: string,
  idempotencyKey: string,
): Promise<WriteResult> {
  return write(sql`/* rejectDuplicateMembershipVerificationIdempotencyKey */
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_provider_evidence_record_id,
      provider, environment, application_id
    ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint}, ${evidenceId},
      'stripe', 'test', ${fixture.applicationId})`)
}

export function completeMembershipVerificationWithoutResult(
  verificationId: string,
): Promise<WriteResult> {
  return write(sql`/* rejectMembershipVerificationTerminalWithoutResultCode */
    UPDATE membership_verifications SET verified_at = CURRENT_TIMESTAMP WHERE id = ${verificationId}`)
}

export function completeMembershipVerification(verificationId: string): Promise<WriteResult> {
  return write(sql`/* completeMembershipVerification */
    UPDATE membership_verifications
    SET verified_at = CURRENT_TIMESTAMP, result_code = 'verified'
    WHERE id = ${verificationId}`)
}

export function setUnstableMembershipVerificationResult(
  verificationId: string,
): Promise<WriteResult> {
  return write(sql`/* rejectUnstableMembershipVerificationResultCode */
    UPDATE membership_verifications SET result_code = 'temporary_provider_wording' WHERE id = ${verificationId}`)
}

export function claimCompletedMembershipVerification(verificationId: string): Promise<WriteResult> {
  return write(sql`/* rejectCompletedMembershipVerificationClaim */
    UPDATE membership_verification_processing_work_items
    SET lease_token = ${randomUUID()}, leased_at = CURRENT_TIMESTAMP, lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes'
    WHERE membership_verification_id = ${verificationId}`)
}

export function createCrossOwnerMembershipVerification(
  fixture: MembershipPurchaseIntentFixture,
  intentId: string,
  evidenceId: string,
): Promise<WriteResult> {
  return write(sql`/* rejectMembershipVerificationCrossOwnerIntent */
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
      membership_provider_evidence_record_id, provider, environment, application_id
    ) VALUES (
      (SELECT id FROM users WHERE id <> ${fixture.userId} ORDER BY id LIMIT 1), ${randomUUID()},
      ${fixture.requestFingerprint}, ${intentId}, ${evidenceId}, 'stripe', 'test', ${fixture.applicationId})`)
}

export async function createMembershipAuditUser(): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`INSERT INTO users DEFAULT VALUES RETURNING id`)
  return rows[0]!.id
}

export function deleteMembershipAuditUser(userId: string): Promise<WriteResult> {
  return write(sql`DELETE FROM users WHERE id = ${userId}`)
}

export async function getMembershipAuditOwnership(
  intentId: string,
  verificationId: string,
): Promise<
  | {
      intent_user_id: string | null
      verification_user_id: string | null
    }
  | undefined
> {
  const { rows } = await read<{
    intent_user_id: string | null
    verification_user_id: string | null
  }>(sql`
    SELECT intent.user_id AS intent_user_id, verification.user_id AS verification_user_id
    FROM membership_purchase_intents intent
    INNER JOIN membership_verifications verification ON verification.id = ${verificationId}
    WHERE intent.id = ${intentId}`)
  return rows[0]
}
