import { timingSafeEqual } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightReplayOutcomeCode } from './replay-admission-locks.mts'
import type { CopyrightReplayAdmission } from './replay-admission.mts'

type Slots = CopyrightReplayAdmission['slots']
type ReplayRow = {
  id: string
  key_name: string
  copyright_replay_retention_group_id: string
  requester_hmac: Buffer
  request_hmac: Buffer
  outcome_code: CopyrightReplayOutcomeCode
}

function equals(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Internal result only. The public expired-response branch is owned by each authenticated adapter. */
export type CopyrightReplayResult = {
  identityId: string
  outcomeCode: CopyrightReplayOutcomeCode
  liveSnapshot: unknown | null
}

class CopyrightReplayCandidate {
  private readonly query: TransactionQuery
  private readonly row: ReplayRow
  private readonly slots: Slots
  private readonly liveSnapshot: unknown | null
  constructor(query: TransactionQuery, row: ReplayRow, slots: Slots, liveSnapshot: unknown | null) {
    this.query = query
    this.row = row
    this.slots = slots
    this.liveSnapshot = liveSnapshot
  }

  async replay(allowOtherRequester = false): Promise<CopyrightReplayResult> {
    const original = this.slots.find(slot => slot.keyId === this.row.key_name)
    if (!original) throw new Error('Copyright replay requires a missing key version')
    const requesterMatches = equals(original.requester, this.row.requester_hmac)
    if (!requesterMatches && !allowOtherRequester) {
      assert(this.liveSnapshot, 404, 'Copyright notice not found')
      assert(false, 403, 'Forbidden')
    }
    assert(
      equals(original.request, this.row.request_hmac),
      409,
      'Idempotency-Key was reused for a different request',
    )
    // Staff may replay another requester's acknowledgment, but cannot re-HMAC an unknown original
    // requester. Keep that slot until the original requester replays or its retention ends.
    const active = requesterMatches ? this.slots[0]! : original
    await this.query(sql`/* touchAuthorizedCopyrightReplay */ UPDATE copyright_replay_identities
      SET copyright_replay_hmac_key_version_id = (SELECT id FROM copyright_replay_hmac_key_versions WHERE key_name = ${active.keyId}), identity_hmac = ${active.digest},
        requester_hmac = ${requesterMatches ? active.requester : this.row.requester_hmac}, request_hmac = ${requesterMatches ? active.request : this.row.request_hmac}, last_replayed_at = ${new Date()}
      WHERE id = ${this.row.id}`)
    return {
      identityId: this.row.id,
      outcomeCode: this.row.outcome_code,
      liveSnapshot: this.liveSnapshot,
    }
  }
}

/** Candidate locks precede lookup; a live notice is always locked before group and identity. */
export async function findCopyrightReplayIdentity(
  admission: CopyrightReplayAdmission,
): Promise<CopyrightReplayCandidate | null> {
  const { query, input, slots } = admission
  const { rows: candidates } = await query<ReplayRow>(sql`/* findCopyrightReplayIdentity */
    SELECT identity.id, key_version.key_name, identity.copyright_replay_retention_group_id,
      identity.requester_hmac, identity.request_hmac, identity.outcome_code
    FROM copyright_replay_identities identity
    JOIN copyright_replay_hmac_key_versions key_version ON key_version.id = identity.copyright_replay_hmac_key_version_id
    JOIN unnest(${slots.map(slot => slot.keyId)}::text[], ${slots.map(slot => slot.digest.toString('hex'))}::text[]) candidate(key_id, digest)
      ON key_version.key_name = candidate.key_id AND identity.identity_hmac = decode(candidate.digest, 'hex')
    WHERE identity.family = ${input.family} AND identity.jurisdiction = ${input.jurisdiction} LIMIT 2`)
  if (candidates.length > 1)
    throw new Error('Copyright replay admission has duplicate retained identities')
  const candidate = candidates[0]
  if (!candidate) {
    await admission.requireKeyVersions()
    return null
  }
  const matchedSlot = slots.find(slot => slot.keyId === candidate.key_name)
  if (
    matchedSlot &&
    equals(matchedSlot.requester, candidate.requester_hmac) &&
    !equals(matchedSlot.request, candidate.request_hmac)
  ) {
    await admission.requireKeyVersions()
    assert(false, 409, 'Idempotency-Key was reused for a different request')
  }
  const { rows: owners } = await query<{ id: string }>(sql`/* discoverCopyrightReplayLiveNotice */
    SELECT id FROM copyright_notices WHERE copyright_replay_retention_group_id = ${candidate.copyright_replay_retention_group_id}`)
  if (owners[0]) await admission.lockNoticeLifetime(owners[0].id)
  const { rows: notices } = await query<{ id: string }>(sql`/* lockCopyrightReplayLiveNotice */
    SELECT id FROM copyright_notices WHERE copyright_replay_retention_group_id = ${candidate.copyright_replay_retention_group_id} FOR SHARE`)
  const { rows: groups } = await query(sql`/* lockCopyrightReplayRetentionGroup */
    SELECT id FROM copyright_replay_retention_groups WHERE id = ${candidate.copyright_replay_retention_group_id} FOR SHARE`)
  if (!groups.length) return null
  await admission.requireKeyVersions()
  const { rows } = await query<ReplayRow>(sql`/* lockCopyrightReplayIdentity */ SELECT identity.id,
      key_version.key_name, identity.copyright_replay_retention_group_id, identity.requester_hmac, identity.request_hmac, identity.outcome_code
    FROM copyright_replay_identities identity
    JOIN copyright_replay_hmac_key_versions key_version ON key_version.id = identity.copyright_replay_hmac_key_version_id
    WHERE identity.id = ${candidate.id} FOR UPDATE OF identity`)
  const identity = rows[0]
  if (!identity) return null
  const notice = notices[0]
  const { rows: receipts } = notice
    ? await query<{ response_snapshot: unknown }>(sql`/* readExactLiveCopyrightReplayReceipt */
    SELECT receipt.response_snapshot FROM copyright_notice_replay_receipts receipt
    WHERE receipt.copyright_replay_identity_id = ${identity.id} AND receipt.copyright_notice_id = ${notice.id}
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations work
        WHERE work.copyright_notice_identity_id = ${notice.id} AND work.erasure_started_at IS NOT NULL)`)
    : { rows: [] }
  return new CopyrightReplayCandidate(
    query,
    identity,
    slots,
    receipts[0]?.response_snapshot ?? null,
  )
}
