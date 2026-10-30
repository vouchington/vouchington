import sql from 'sql-template-strings'
import type { CopyrightReplayOutcomeCode } from './replay-admission-locks.mts'
import type { CopyrightReplayAdmission } from './replay-admission.mts'

/** The caller's final all-candidate recheck found no replay while retaining those advisory locks. */
export async function recordCopyrightReplayIdentity(
  admission: CopyrightReplayAdmission,
  noticeId: string,
  outcome: CopyrightReplayOutcomeCode,
  responseSnapshot: Record<string, unknown>,
): Promise<string> {
  const { query, input, slots } = admission
  const { rows: notices } = await query<{
    copyright_replay_retention_group_id: string
  }>(sql`/* lockCopyrightNewReplayNotice */
    SELECT copyright_replay_retention_group_id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
  const groupId = notices[0]?.copyright_replay_retention_group_id
  if (!groupId) throw new Error('Copyright replay requires its live notice owner')
  const { rows: groups } = await query(sql`/* lockCopyrightNewReplayGroup */
    SELECT id FROM copyright_replay_retention_groups WHERE id = ${groupId} AND case_purged_at IS NULL FOR SHARE`)
  if (!groups.length) throw new Error('Copyright replay group has expired')
  await admission.requireKeyVersions()
  const { rows: existing } = await query(sql`/* rejectDuplicateCopyrightReplayAdmission */
    SELECT identity.id FROM copyright_replay_identities identity
    JOIN copyright_replay_hmac_key_versions key_version ON key_version.id = identity.copyright_replay_hmac_key_version_id
    JOIN unnest(${slots.map(slot => slot.keyId)}::text[], ${slots.map(slot => slot.digest.toString('hex'))}::text[]) candidate(key_id, digest)
      ON key_version.key_name = candidate.key_id AND identity.identity_hmac = decode(candidate.digest, 'hex')
    WHERE identity.family = ${input.family} AND identity.jurisdiction = ${input.jurisdiction} LIMIT 1`)
  if (existing.length)
    throw new Error('Copyright replay admission requires its final duplicate recheck')
  const active = slots[0]!
  const { rows } = await query<{ id: string }>(sql`/* recordCopyrightReplayIdentity */
    INSERT INTO copyright_replay_identities (family, jurisdiction, copyright_replay_hmac_key_version_id,
      identity_hmac, requester_hmac, request_hmac, outcome_code, copyright_replay_retention_group_id, last_replayed_at)
    VALUES (${input.family}, ${input.jurisdiction}, (SELECT id FROM copyright_replay_hmac_key_versions WHERE key_name = ${active.keyId}), ${active.digest}, ${active.requester},
      ${active.request}, ${outcome}, ${groupId}, ${new Date()}) RETURNING id`)
  const id = rows[0]?.id
  if (!id) throw new Error('Copyright replay identity was not recorded')
  await query(sql`/* recordExactLiveCopyrightReplayReceipt */ INSERT INTO copyright_notice_replay_receipts (
    copyright_replay_identity_id, copyright_notice_id, copyright_replay_retention_group_id, response_snapshot)
    VALUES (${id}, ${noticeId}, ${groupId}, ${JSON.stringify(responseSnapshot)}::jsonb)`)
  return id
}
