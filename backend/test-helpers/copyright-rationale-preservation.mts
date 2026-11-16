import { randomInt } from 'node:crypto'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { v7 } from 'uuid'

/** Committed cases let a second transaction add a party during the real retention page. */
export async function prepareCopyrightRationalePreservationPage(
  query: TransactionQuery,
  actorId: string,
) {
  const oldAt = new Date(Date.UTC(2000, 0, 1) + randomInt(0, 365 * 86_400_000))
  // Reserve adjacent low nibbles under one random UUIDv7 prefix: no shared row can fall
  // between the owned page, its lookahead, and its exclusive predecessor cursor.
  const cursorId = `${v7({ msecs: oldAt.getTime() }).slice(0, -1)}0`
  const ids = [1, 2, 3].map(offset => `${cursorId.slice(0, -1)}${offset.toString(16)}`)
  await using seed = await beginTransaction()
  const { rows: notices } = await seed<{ id: string }>(
    `/* seedRationalePreservationCases */ INSERT INTO copyright_notices
     (jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description, policy_version)
     SELECT 'eu_dsa', 'copyright', $1, 'contact', 'synthetic work', 'test'
     FROM generate_series(1, 3) RETURNING id`,
    [oldAt],
  )
  const cases = ids.map((id, index) => ({ id, noticeId: notices[index]!.id }))
  await seed(
    `/* seedRationalePreservationAttempts */ INSERT INTO copyright_decision_rationales
     (id, copyright_notice_id, recorded_by_id, tool_name, rationale_ciphertext)
     SELECT id, notice_id, $3, 'replay_copyright_intent', ciphertext
     FROM unnest($1::uuid[], $2::uuid[], $4::text[]) item(id, notice_id, ciphertext)`,
    [
      ids,
      cases.map(row => row.noticeId),
      actorId,
      ids.map(id => encryptSecret('Retained rationale', `copyright-decision-rationale:${id}`)),
    ],
  )
  await seed.commit()
  // The caller rolls back this cursor change, preserving dirty shared progress.
  await query(
    `/* scopeRationalePreservationPage */ INSERT INTO security_retention_cleanup_cursors
     (source, cursor_at, cursor_id)
     SELECT 'copyright_rationales_attempts', created_at, $1::uuid
     FROM copyright_decision_rationales WHERE id = $2::uuid
     ON CONFLICT (source) DO UPDATE
     SET cursor_id = EXCLUDED.cursor_id, cursor_at = EXCLUDED.cursor_at`,
    [cursorId, ids[0]],
  )
  return cases as [(typeof cases)[number], (typeof cases)[number], (typeof cases)[number]]
}

/** The party and its hold become visible together before the destroyer's eligibility recheck. */
export async function addHeldCopyrightRationaleParty(noticeId: string, userId: string) {
  await using query = await beginTransaction()
  await query(
    `/* addRationalePreservationHold */ INSERT INTO user_legal_preservation_holds
     (account_user_id, placed_by_id, reference_ciphertext) VALUES ($1, $1, 'synthetic hold')`,
    [userId],
  )
  await query(
    `/* addRationalePreservationParty */ INSERT INTO copyright_notice_submissions
     (copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext)
     VALUES ($1, $2, 'supplement', CURRENT_TIMESTAMP, 'signed_in_form', 'synthetic supplement')`,
    [noticeId, userId],
  )
  await query.commit()
}

export async function readCopyrightRationalePreservationPage(
  query: TransactionQuery,
  ids: string[],
) {
  const { rows } = await query<{ id: string; rationale_ciphertext: string }>(
    `/* readRationalePreservationPage */ SELECT id, rationale_ciphertext
     FROM copyright_decision_rationales WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [ids],
  )
  return rows
}
