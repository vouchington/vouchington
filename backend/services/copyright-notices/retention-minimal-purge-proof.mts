import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { advanceCopyrightMinimalBlockerProof } from './retention-minimal-blocker-proof.mts'
import { scanCopyrightMinimalPurgeMutations } from './retention-minimal-purge-mutation-page.mts'
import { scanCopyrightMinimalPurgeParties } from './retention-minimal-purge-party-page.mts'

type ProofOutcome = 'progress' | 'ready' | 'ineligible'
type ProofWork = {
  party_scan_cursor: string | null
  proof_generation: string | null
  mutation_cursor: string | null
  is_party_scan_complete: boolean
}

/** Called with the global sequence row SHARE-locked, then the notice row FOR UPDATE. */
export async function advanceCopyrightMinimalPurgeProof(
  query: TransactionQuery,
  noticeId: string,
  pageSize: number,
  currentSequence: string,
): Promise<ProofOutcome> {
  const { rows: identities } = await query<{ proof_generation: string }>(sql`
    /* readCopyrightMinimalPurgeProofGeneration */
    SELECT proof_generation FROM copyright_notice_retained_identities
    WHERE id = ${noticeId}`)
  const proofGeneration = identities[0]?.proof_generation
  if (proofGeneration === undefined) return 'ineligible'
  await query(sql`/* beginCopyrightMinimalPurgeProof */
    INSERT INTO copyright_notice_minimal_purge_continuations (copyright_notice_identity_id, legal_clock_at)
    SELECT erased.copyright_notice_id, erased.legal_clock_at
    FROM copyright_notice_retention_erasures erased
    WHERE erased.copyright_notice_id = ${noticeId}
    ON CONFLICT (copyright_notice_identity_id) DO NOTHING`)
  const { rows: works } = await query<ProofWork>(sql`/* lockCopyrightMinimalPurgeProof */
    SELECT party_scan_cursor, proof_generation, mutation_cursor, is_party_scan_complete
    FROM copyright_notice_minimal_purge_continuations
    WHERE copyright_notice_identity_id = ${noticeId} FOR UPDATE`)
  const work = works[0]
  if (!work) return 'ineligible'
  if (work.proof_generation !== proofGeneration) {
    await query(sql`/* restartCopyrightMinimalPurgePartyProof */
      UPDATE copyright_notice_minimal_purge_continuations
      SET proof_generation = ${proofGeneration}::bigint,
        mutation_cursor = ${currentSequence}::bigint,
        party_scan_cursor = NULL, is_party_scan_complete = false,
        open_hold_count = 0, unpurged_incident_account_count = 0,
        party_legal_clock_at = NULL,
        blocker_generation = ${proofGeneration}::bigint,
        blocker_phase_index = 0, blocker_cursor = NULL,
        is_blocker_scan_complete = false, has_blocker = false,
        has_valid_target = false, has_unrestricted_target = false,
        has_claimant_receipt = false,
        has_compliant_notice_assessment = false,
        has_compliant_form_assessment = false,
        phase_index = 0
      WHERE copyright_notice_identity_id = ${noticeId}`)
    return 'progress'
  }
  if (!work.is_party_scan_complete) {
    const page = await scanCopyrightMinimalPurgeParties(
      query,
      noticeId,
      work.party_scan_cursor,
      pageSize,
    )
    if (page.scanned > 0 && (page.processed === 0 || page.processed > pageSize))
      throw new Error('Copyright party proof exceeded its page bound')
    await query(sql`/* checkpointCopyrightMinimalPurgePartyProof */
      UPDATE copyright_notice_minimal_purge_continuations
      SET party_scan_cursor = ${page.last_id}::uuid,
        is_party_scan_complete = ${page.scanned <= pageSize},
        open_hold_count = open_hold_count + ${page.open_delta},
        unpurged_incident_account_count = unpurged_incident_account_count + ${page.unpurged_delta},
        party_legal_clock_at = GREATEST(party_legal_clock_at, ${page.latest_clock}::timestamptz)
      WHERE copyright_notice_identity_id = ${noticeId}`)
    return 'progress'
  }
  if (work.mutation_cursor !== currentSequence) {
    if (work.mutation_cursor === null) throw new Error('Copyright mutation cursor is missing')
    const page = await scanCopyrightMinimalPurgeMutations(
      query,
      noticeId,
      work.mutation_cursor,
      currentSequence,
      pageSize,
    )
    if (page.scanned > 0 && (page.processed > pageSize || !page.last_sequence))
      throw new Error('Copyright mutation proof exceeded its page bound')
    await query(sql`/* checkpointCopyrightMinimalPurgeMutations */
      UPDATE copyright_notice_minimal_purge_continuations
      SET mutation_cursor = ${page.scanned <= pageSize ? currentSequence : page.last_sequence}::bigint,
        open_hold_count = open_hold_count + ${page.open_delta},
        unpurged_incident_account_count = unpurged_incident_account_count + ${page.unpurged_delta},
        party_legal_clock_at = GREATEST(party_legal_clock_at, ${page.latest_clock}::timestamptz)
      WHERE copyright_notice_identity_id = ${noticeId}`)
    return 'progress'
  }
  return advanceCopyrightMinimalBlockerProof(query, noticeId, proofGeneration, pageSize)
}
