import { v7 } from 'uuid'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightMinimalRecordPurgeEligibleSql } from '../../services/copyright-notices/retention-minimal-purge-eligibility.mts'

export async function isMinimalPurgeEligible(
  noticeId: string,
  now: Date,
  cutoff: Date,
): Promise<boolean> {
  const { rows } = await read<{ id: string }>(
    sql`/* testCopyrightAccountClockEligibility */`
      .append(copyrightMinimalRecordPurgeEligibleSql(now, cutoff))
      .append(sql`SELECT id FROM purge_eligible WHERE id = ${noticeId}`),
  )
  return rows.length === 1
}

export async function seedNonoperativeIncidentAccount(
  noticeId: string,
  purgedAt: Date | null,
): Promise<string> {
  const accountId = v7()
  await write(sql`/* seedCopyrightIncidentAccount */
    INSERT INTO retained_user_identities (id, purged_at) VALUES (${accountId}, ${purgedAt})`)
  await write(sql`/* seedNonoperativeCopyrightIncident */
    INSERT INTO copyright_repeat_infringer_incidents (
      account_user_id, copyright_notice_id, is_operative
    ) VALUES (${accountId}, ${noticeId}, false)`)
  return accountId
}

export async function isRetainedIncidentAccount(
  noticeId: string,
  accountId: string,
): Promise<boolean> {
  const { rows } = await read<{ is_repeat_infringer_account: boolean }>(sql`
    /* assertCopyrightIncidentRetainedAccountRelation */
    SELECT is_repeat_infringer_account FROM copyright_notice_retained_parties
    WHERE copyright_notice_identity_id = ${noticeId} AND account_user_id = ${accountId}`)
  return rows[0]?.is_repeat_infringer_account ?? false
}

export async function copyrightIncidentExists(noticeId: string): Promise<boolean> {
  const { rows } = await read(sql`/* findStagedCopyrightIncident */
    SELECT 1 FROM copyright_repeat_infringer_incidents
    WHERE copyright_notice_id = ${noticeId}`)
  return rows.length > 0
}

export async function copyrightNoticeExists(noticeId: string): Promise<boolean> {
  const { rows } = await read(sql`/* assertExpiredCopyrightCasePurged */
    SELECT 1 FROM copyright_notices WHERE id = ${noticeId}`)
  return rows.length > 0
}

export async function retainedAccountExists(accountId: string): Promise<boolean> {
  const { rows } = await read(sql`/* assertRetainedIncidentAccountSurvives */
    SELECT 1 FROM retained_user_identities WHERE id = ${accountId}`)
  return rows.length > 0
}
