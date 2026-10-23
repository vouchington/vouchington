import { v7 } from 'uuid'
import { beginTransaction, read, write } from '@data-stores/psql'
import { FINAL_USER_PURGE_LOCK_KEY } from '@modules/utils/final-user-purge-lock'
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
    WHERE copyright_notice_id = ${noticeId} AND account_user_id = ${accountId}`)
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

export async function markMinimalAccountClockCaseErased(noticeId: string): Promise<void> {
  await write(sql`/* seedCopyrightAccountClockRaceMarker */
    INSERT INTO copyright_notice_retention_erasures
      (copyright_notice_id, retention_days, erased_object_count, legal_clock_at)
    VALUES (${noticeId}, 1095, 0,
      fn_project_copyright_minimal_record_legal_clock(${noticeId}))`)
}

/** Starts the real final-user-purge lock and leaves its factual clock update uncommitted. */
export async function startPendingAccountPurge(accountId: string) {
  const transaction = await beginTransaction()
  try {
    await transaction(sql`/* lockFinalUserPurgeBeforeCaseClock */
      SELECT pg_advisory_xact_lock(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))`)
    await transaction(sql`/* completeCopyrightIncidentAccountPurge */
      UPDATE retained_user_identities SET purged_at = '2029-10-22T00:00:00Z'
      WHERE id = ${accountId}`)
    return transaction
  } catch (err) {
    await transaction.rollback()
    throw err
  }
}
