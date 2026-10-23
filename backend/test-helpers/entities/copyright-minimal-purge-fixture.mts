import { v7 } from 'uuid'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function seedFreshMinimalErasureMarker(noticeId: string): Promise<void> {
  const markerId = v7({ msecs: Date.parse('2030-10-23T00:00:00Z') })
  await write(sql`/* seedFreshCopyrightErasureMarker */
    INSERT INTO copyright_notice_retention_erasures
      (id, copyright_notice_id, retention_days, erased_object_count, legal_clock_at)
    VALUES (${markerId}, ${noticeId}, 1095, 0,
      fn_project_copyright_minimal_record_legal_clock(${noticeId}))`)
}

export async function isErasedClaimantLinkNull(noticeId: string): Promise<boolean> {
  const { rows } = await read<{ claimant_user_id: string | null }>(sql`
    /* assertErasedCopyrightClaimantLink */
    SELECT claimant_user_id FROM copyright_notices WHERE id = ${noticeId}`)
  return rows.length === 1 && rows[0]?.claimant_user_id === null
}

export async function placeErasedClaimantHold(
  claimantId: string,
  moderatorId: string,
): Promise<void> {
  await write(sql`/* holdErasedCopyrightClaimant */
    INSERT INTO user_legal_preservation_holds
      (account_user_id, placed_by_id, reference_ciphertext)
    VALUES (${claimantId}, ${moderatorId}, 'encrypted-reference')`)
}

export async function releaseErasedClaimantHold(
  claimantId: string,
  moderatorId: string,
): Promise<void> {
  await write(sql`/* releaseErasedCopyrightClaimantHold */
    UPDATE user_legal_preservation_holds SET released_at = '2031-10-23T00:00:00Z',
      released_by_id = ${moderatorId}
    WHERE account_user_id = ${claimantId}`)
}

export async function countRetainedMinimalParties(noticeId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* assertCopyrightRetainedPartiesDrained */
    SELECT count(*)::integer AS count FROM copyright_notice_retained_parties
    WHERE copyright_notice_identity_id = ${noticeId}`)
  return rows[0]?.count ?? 0
}

export async function minimalPurgeWorkExists(noticeId: string): Promise<boolean> {
  const { rows } = await read(sql`/* assertCopyrightPurgeWorkComplete */
    SELECT 1 FROM copyright_notice_minimal_purge_continuations
    WHERE copyright_notice_identity_id = ${noticeId}`)
  return rows.length > 0
}

export async function seedLateCopyrightDeliveryParent(noticeId: string): Promise<string> {
  const intentId = v7()
  await write(sql`/* seedLateChildCopyrightDeliveryParent */
    INSERT INTO copyright_notice_delivery_work_items
      (id, copyright_notice_id, recipient_role, delivery_kind, channel,
        idempotency_key, delivery_attempted_at, sent_at)
    VALUES (${intentId}, ${noticeId}, 'claimant', 'claimant_receipt', 'in_app',
      ${`late-child-${intentId}`}, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z')`)
  return intentId
}

export async function seedAdvancedCopyrightParentPhase(
  noticeId: string,
  parentPhase: number,
): Promise<void> {
  await write(sql`/* seedCopyrightAdvancedParentPhase */
    INSERT INTO copyright_notice_minimal_purge_continuations
      (copyright_notice_identity_id, legal_clock_at, phase_index, proof_generation,
        mutation_cursor, is_party_scan_complete, blocker_generation, is_blocker_scan_complete)
    SELECT erased.copyright_notice_id, erased.legal_clock_at, ${parentPhase},
      identity.proof_generation, mutation.current_sequence, true,
      identity.proof_generation, true
    FROM copyright_notice_retention_erasures erased
    JOIN copyright_notice_retained_identities identity ON identity.id = erased.copyright_notice_id
    JOIN copyright_legal_mutation_sequence_states mutation ON mutation.is_singleton
    WHERE erased.copyright_notice_id = ${noticeId}`)
}

export async function addCopyrightAttemptsAfterLeafPhase(intentId: string): Promise<void> {
  await write(sql`/* addCopyrightAttemptsAfterLeafPhase */
    INSERT INTO copyright_notice_delivery_attempts
      (work_item_id, generation, attempt_number, lease_token, started_at)
    SELECT ${intentId}, 1, attempt_number, uuidv7(), '2026-10-23T00:00:00Z'
    FROM generate_series(1, 55) AS attempt_number`)
}

export async function readLateCopyrightAttemptsAndPhase(
  noticeId: string,
  intentId: string,
): Promise<{ count: number; phase_index: number } | undefined> {
  const { rows } = await read<{ count: number; phase_index: number }>(sql`
    /* assertLateCopyrightAttemptsSurviveParentPage */
    SELECT count(attempt.id)::integer AS count, work.phase_index
    FROM copyright_notice_minimal_purge_continuations work
    LEFT JOIN copyright_notice_delivery_attempts attempt ON attempt.work_item_id = ${intentId}
    WHERE work.copyright_notice_identity_id = ${noticeId}
    GROUP BY work.phase_index`)
  return rows[0]
}
