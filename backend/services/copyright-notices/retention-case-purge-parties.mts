import type { TransactionQuery } from '@data-stores/psql/types'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import sql from 'sql-template-strings'

const PARTY_SOURCES = ['claimant', 'submissions', 'incidents', 'targets'] as const
export const COPYRIGHT_CASE_PARTY_SOURCE_COUNT = PARTY_SOURCES.length

type PartyRow = { id: string; user_id: string | null }

/** Capture one bounded source page before private-field erasure can remove a party reference. */
export async function retainCopyrightCasePartyPage(
  query: TransactionQuery,
  noticeId: string,
  phaseIndex: number,
  afterId: string | null,
  limit: number,
): Promise<{ nextId: string | null; hasMore: boolean; complete: boolean }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid copyright party page size')
  const source = PARTY_SOURCES[phaseIndex]
  if (!source) return { nextId: null, hasMore: false, complete: true }
  const cursor = afterId === null ? sql`` : sql` AND id > ${afterId}::uuid`
  let statement = sql`/* retainCopyrightCasePartyPage */ SELECT id, claimant_user_id AS user_id
    FROM copyright_notices WHERE id = ${noticeId}::uuid`
  if (source === 'submissions')
    statement = sql`/* retainCopyrightCasePartyPage */
      SELECT id, submitted_by_id AS user_id FROM copyright_notice_submissions
      WHERE copyright_notice_id = ${noticeId}::uuid`.append(cursor)
  if (source === 'incidents')
    statement = sql`/* retainCopyrightCasePartyPage */
      SELECT id, account_user_id AS user_id FROM copyright_repeat_infringer_incidents
      WHERE copyright_notice_id = ${noticeId}::uuid`.append(cursor)
  if (source === 'targets')
    statement = sql`/* retainCopyrightCasePartyPage */
      SELECT id, surface_owner_user_id AS user_id FROM copyright_notice_targets
      WHERE copyright_notice_id = ${noticeId}::uuid`.append(cursor)
  statement.append(sql` ORDER BY id LIMIT ${limit}`)
  const { rows } = await query<PartyRow>(statement)
  const page = rows
  const userIds = page.map(row => row.user_id).filter((id): id is string => id !== null)
  if (source === 'targets' && page.length > 0) {
    const placementSql = sql`/* retainCopyrightCasePlacementParties */
      SELECT DISTINCT party.user_id FROM copyright_notice_targets target
      CROSS JOIN LATERAL `.append(copyrightPlacementPartiesSql('retain'))
      .append(sql` party WHERE target.copyright_notice_id = ${noticeId}::uuid
        AND target.id = ANY(${page.map(row => row.id)}::uuid[])
        AND party.user_id IS NOT NULL`)
    const { rows: placementRows } = await query<{ user_id: string }>(placementSql)
    userIds.push(...placementRows.map(row => row.user_id))
  }
  if (userIds.length > 0) {
    await query(sql`/* retainCopyrightCasePartyIdentities */
      INSERT INTO copyright_notice_party_identities
        (copyright_notice_id, account_user_id, is_incident_party)
      SELECT ${noticeId}::uuid, identity.id, ${source === 'incidents'}
      FROM retained_user_identities identity
      WHERE identity.id = ANY(${userIds}::uuid[])
      ON CONFLICT (copyright_notice_id, account_user_id) DO UPDATE
      SET is_incident_party = copyright_notice_party_identities.is_incident_party
        OR EXCLUDED.is_incident_party
      WHERE EXCLUDED.is_incident_party AND NOT copyright_notice_party_identities.is_incident_party`)
  }
  return {
    nextId: page.at(-1)?.id ?? null,
    hasMore: rows.length === limit,
    complete: false,
  }
}
