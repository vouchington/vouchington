import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'

export type LegalPhase = 'claimant' | 'submissions' | 'incidents' | 'targets' | 'done'
export type LegalCursor = {
  phase: LegalPhase | null
  childId: string | null
  holdGeneration: string | null
  partyGeneration: string | null
  latestReleaseAt: Date | null
}
export type LegalPage = LegalCursor & { blocked: boolean }

/** A generation change invalidates every prior page, including its hold-release clock. */
export async function checkCopyrightThreadLegalPage(
  transaction: TransactionQuery,
  noticeId: string,
  cutoff: Date,
  batchSize: number,
  cursor: LegalCursor,
): Promise<LegalPage> {
  const { rows: generations } = await transaction<{
    preservation_generation: string
    party_generation: string
  }>(sql`/* lockCopyrightThreadLegalGenerations */
    SELECT global.preservation_generation,
      COALESCE(parties.generation, 0) AS party_generation
    FROM copyright_notice_retention_generations global
    LEFT JOIN copyright_notice_thread_party_generations parties
      ON parties.copyright_notice_id = ${noticeId}
    WHERE global.id FOR UPDATE OF global`)
  const current = generations[0]!
  const changed =
    cursor.holdGeneration !== current.preservation_generation ||
    cursor.partyGeneration !== current.party_generation
  const phase = changed ? 'claimant' : (cursor.phase ?? 'claimant')
  const childId = changed ? null : cursor.childId
  const latestReleaseAt = changed ? null : cursor.latestReleaseAt
  const base = {
    holdGeneration: current.preservation_generation,
    partyGeneration: current.party_generation,
  }
  if (phase === 'done') {
    return { ...base, phase, childId: null, latestReleaseAt, blocked: false }
  }

  const page = await listCopyrightThreadPartyPage(transaction, noticeId, phase, childId, batchSize)
  const { rows: holds } = await transaction<{
    active: boolean
    released_at: Date | null
  }>(sql`/* inspectCopyrightThreadPartyHolds */
    SELECT EXISTS (
      SELECT 1 FROM user_legal_preservation_holds held
      WHERE held.account_user_id = party.user_id AND held.released_at IS NULL
      LIMIT 1
    ) AS active, released.released_at
    FROM unnest(${[...new Set(page.accountIds)]}::uuid[]) party(user_id)
    LEFT JOIN LATERAL (
      SELECT held.released_at FROM user_legal_preservation_holds held
      WHERE held.account_user_id = party.user_id AND held.released_at IS NOT NULL
      ORDER BY held.released_at DESC LIMIT 1
    ) released ON true`)
  let latest = latestReleaseAt
  for (const hold of holds) {
    if (hold.active) {
      return { ...base, phase, childId, latestReleaseAt: latest, blocked: true }
    }
    if (hold.released_at && (!latest || hold.released_at > latest)) latest = hold.released_at
  }
  if (latest && latest > cutoff) {
    return { ...base, phase, childId, latestReleaseAt: latest, blocked: true }
  }
  return {
    ...base,
    phase: phase === 'claimant' || page.ids.length < batchSize ? nextPhase(phase) : phase,
    childId: phase === 'claimant' || page.ids.length < batchSize ? null : page.ids.at(-1)!,
    latestReleaseAt: latest,
    blocked: false,
  }
}

async function listCopyrightThreadPartyPage(
  transaction: TransactionQuery,
  noticeId: string,
  phase: Exclude<LegalPhase, 'done'>,
  childId: string | null,
  batchSize: number,
): Promise<{ ids: string[]; accountIds: string[] }> {
  if (phase === 'claimant') {
    const { rows } = await transaction<{ id: string; user_id: string | null }>(sql`
      /* scanCopyrightThreadClaimant */
      SELECT id, claimant_user_id AS user_id FROM copyright_notices
      WHERE id = ${noticeId} LIMIT 1`)
    return {
      ids: rows.map(row => row.id),
      accountIds: rows.flatMap(row => (row.user_id ? [row.user_id] : [])),
    }
  }
  if (phase === 'submissions' || phase === 'incidents') {
    const { rows } =
      phase === 'submissions'
        ? await transaction<{ id: string; user_id: string | null }>(sql`
          /* scanCopyrightThreadSubmissionParties */
          SELECT id, submitted_by_id AS user_id FROM copyright_notice_submissions
          WHERE copyright_notice_id = ${noticeId}
            AND id > COALESCE(${childId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY id LIMIT ${batchSize}`)
        : await transaction<{ id: string; user_id: string | null }>(sql`
          /* scanCopyrightThreadIncidentParties */
          SELECT id, account_user_id AS user_id FROM copyright_repeat_infringer_incidents
          WHERE copyright_notice_id = ${noticeId}
            AND id > COALESCE(${childId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY id LIMIT ${batchSize}`)
    return {
      ids: rows.map(row => row.id),
      accountIds: rows.flatMap(row => (row.user_id ? [row.user_id] : [])),
    }
  }
  const { rows: targets } = await transaction<{ id: string }>(sql`
    /* scanCopyrightThreadTargetParties */
    SELECT id FROM copyright_notice_targets
    WHERE copyright_notice_id = ${noticeId}
      AND id > COALESCE(${childId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY id LIMIT ${batchSize}`)
  const ids = targets.map(row => row.id)
  if (ids.length === 0) return { ids, accountIds: [] }
  const statement = sql`/* readCopyrightThreadTargetPartyPage */
    SELECT party.user_id FROM copyright_notice_targets target
    CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql('retain'))
  statement.append(sql` party WHERE target.id = ANY(${ids}::uuid[])`)
  const { rows: parties } = await transaction<{ user_id: string | null }>(statement)
  return { ids, accountIds: parties.flatMap(row => (row.user_id ? [row.user_id] : [])) }
}

function nextPhase(phase: Exclude<LegalPhase, 'done'>): LegalPhase {
  if (phase === 'claimant') return 'submissions'
  if (phase === 'submissions') return 'incidents'
  if (phase === 'incidents') return 'targets'
  return 'done'
}
