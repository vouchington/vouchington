import type { TransactionQuery } from '@data-stores/psql'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import sql from 'sql-template-strings'

/** Retain a concrete account association before its live user FK may be erased. */
export async function retainCopyrightCaseAccountParty(
  query: TransactionQuery,
  noticeId: string,
  accountUserId: string | null,
  incident = false,
): Promise<void> {
  if (!accountUserId) return
  await query(sql`/* retainCopyrightCaseAccountParty */
    INSERT INTO copyright_notice_party_identities
      (copyright_notice_id, account_user_id, is_incident_party)
    SELECT ${noticeId}::uuid, identity.id, ${incident}
    FROM retained_user_identities identity WHERE identity.id = ${accountUserId}::uuid
    ON CONFLICT (copyright_notice_id, account_user_id) DO UPDATE
      SET is_incident_party = copyright_notice_party_identities.is_incident_party
        OR EXCLUDED.is_incident_party
      WHERE EXCLUDED.is_incident_party AND NOT copyright_notice_party_identities.is_incident_party`)
  await query(sql`/* advanceCopyrightCaseAccountPartyClock */
    UPDATE copyright_notices SET last_legal_activity_at =
      GREATEST(last_legal_activity_at, clock_timestamp()) WHERE id = ${noticeId}::uuid`)
}

/** Each inserted target has only its post/profile owner or activation binder. */
export async function retainCopyrightCaseTargetParties(
  query: TransactionQuery,
  noticeId: string,
  targetIds: readonly string[],
): Promise<void> {
  if (targetIds.length === 0) return
  await query(
    sql`/* retainCopyrightCaseTargetParties */
    INSERT INTO copyright_notice_party_identities
      (copyright_notice_id, account_user_id)
    SELECT DISTINCT ${noticeId}::uuid, identity.id
    FROM copyright_notice_targets target
    CROSS JOIN LATERAL `.append(copyrightPlacementPartiesSql('retain')).append(sql` party
      JOIN retained_user_identities identity ON identity.id = party.user_id
      WHERE target.copyright_notice_id = ${noticeId}::uuid
        AND target.id = ANY(${[...targetIds]}::uuid[])
    ORDER BY identity.id ASC NULLS LAST
    ON CONFLICT (copyright_notice_id, account_user_id) DO NOTHING`),
  )
  await query(sql`/* advanceCopyrightCaseTargetPartyClock */
    UPDATE copyright_notices SET last_legal_activity_at =
      GREATEST(last_legal_activity_at, clock_timestamp()) WHERE id = ${noticeId}::uuid`)
}

/** The incident upsert returns only accounts touched in its own transaction. */
export async function retainCopyrightCaseIncidentParties(
  query: TransactionQuery,
  noticeId: string,
  accountUserIds: readonly string[],
): Promise<void> {
  if (accountUserIds.length === 0) return
  await query(sql`/* retainCopyrightCaseIncidentParties */
    INSERT INTO copyright_notice_party_identities
      (copyright_notice_id, account_user_id, is_incident_party)
    SELECT ${noticeId}::uuid, identity.id, true
    FROM retained_user_identities identity
    WHERE identity.id = ANY(${[...new Set(accountUserIds)]}::uuid[])
    ORDER BY identity.id ASC NULLS LAST
    ON CONFLICT (copyright_notice_id, account_user_id) DO UPDATE
      SET is_incident_party = true
      WHERE NOT copyright_notice_party_identities.is_incident_party`)
  await query(sql`/* advanceCopyrightCaseIncidentPartyClock */
    UPDATE copyright_notices SET last_legal_activity_at =
      GREATEST(last_legal_activity_at, clock_timestamp()) WHERE id = ${noticeId}::uuid`)
}
