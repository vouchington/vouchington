import { randomInt } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import { testRationaleRetentionEligible } from '../../security-retention.mts'
import sql from 'sql-template-strings'
import { processCopyrightActionIntent } from '../../../services/copyright-notices/index.mts'

/** A complete published snapshot covering this fixture's receipt, after its UUIDv7 insert. */
export async function publishCopyrightCasePurgeCoverage(noticeId: string): Promise<void> {
  const { rows } = await read<{ received_at: Date }>(sql`
    /* readCopyrightCasePurgeFixtureReceipt */
    SELECT received_at FROM copyright_notices WHERE id = ${noticeId}::uuid`)
  const receivedAt = rows[0]?.received_at
  if (!receivedAt) throw new Error('Purge fixture notice is missing')
  const periodStart = new Date(receivedAt.getTime() - randomInt(1_000_000, 2_000_000))
  const reportedAt = new Date(Date.now() + 60_000)
  const periodEnd = new Date(reportedAt.getTime() - 1)
  await write(sql`/* publishCopyrightCasePurgeFixtureCoverage */
    INSERT INTO copyright_eu_transparency_reports (
      jurisdiction, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count, figures_snapshot, method_snapshot,
      reported_at
    ) VALUES (
      'eu_dsa', ${periodStart}, ${periodEnd}, 0, 0, 0, 0, 0, 0,
      '{}'::jsonb, '{"scope":"all_notices"}'::jsonb, ${reportedAt}
    )`)
}

export async function readCopyrightCasePurgeFixture(noticeId: string): Promise<{
  live: boolean
  retained: boolean
  partyCount: number
  submissionCount: number
  artifactCount: number
  rationaleIds: string[]
}> {
  const { rows } = await read<{
    live: boolean
    retained: boolean
    party_count: number
    submission_count: number
    artifact_count: number
    rationale_ids: string[]
  }>(sql`/* readCopyrightCasePurgeFixture */
    SELECT
      EXISTS (SELECT 1 FROM copyright_notices WHERE id = ${noticeId}::uuid) AS live,
      EXISTS (SELECT 1 FROM retained_copyright_notice_identities WHERE id = ${noticeId}::uuid) AS retained,
      (SELECT count(*)::int FROM copyright_notice_party_identities
        WHERE copyright_notice_id = ${noticeId}::uuid) AS party_count,
      (SELECT count(*)::int FROM copyright_notice_submissions
        WHERE copyright_notice_id = ${noticeId}::uuid) AS submission_count,
      (SELECT count(*)::int FROM copyright_notice_evidence_artifacts
        WHERE copyright_notice_id = ${noticeId}::uuid) AS artifact_count,
      (SELECT COALESCE(array_agg(rationale.id), '{}') FROM copyright_decision_rationales rationale
        WHERE rationale.copyright_notice_id = ${noticeId}::uuid
          OR rationale.copyright_notice_email_intake_receipt_id IN (
            SELECT link.copyright_notice_email_intake_id
            FROM copyright_notice_email_intake_notice_links link
            WHERE link.copyright_notice_id = ${noticeId}::uuid)) AS rationale_ids`)
  const row = rows[0]!
  return {
    live: row.live,
    retained: row.retained,
    partyCount: row.party_count,
    submissionCount: row.submission_count,
    artifactCount: row.artifact_count,
    rationaleIds: row.rationale_ids,
  }
}

/** Uses the same durable clock column whose proof is checked after each page. */
export async function advanceCopyrightCasePurgeFixtureClock(noticeId: string): Promise<void> {
  await write(sql`/* advanceCopyrightCasePurgeFixtureClock */
    UPDATE copyright_notices SET last_legal_activity_at = clock_timestamp()
    WHERE id = ${noticeId}::uuid`)
}

/** Adds only this owned notice and account to the retained case-party index. */
export async function addCopyrightCasePurgeFixtureParty(
  noticeId: string,
  accountUserId: string,
): Promise<void> {
  await write(sql`/* addCopyrightCasePurgeFixtureParty */
    INSERT INTO copyright_notice_party_identities (copyright_notice_id, account_user_id, is_incident_party)
    VALUES (${noticeId}::uuid, ${accountUserId}::uuid, false)
    ON CONFLICT (copyright_notice_id, account_user_id) DO NOTHING`)
}

export async function readCopyrightCasePurgeFixtureAccountClock(accountUserId: string): Promise<{
  pending: boolean
  noticeClock: Date | null
}> {
  const { rows } = await read<{ pending: boolean; notice_clock: Date | null }>(sql`
    /* readCopyrightCasePurgeFixtureAccountClock */
    SELECT identity.is_copyright_case_clock_sync_pending AS pending,
      (SELECT max(notice.last_legal_activity_at)
       FROM copyright_notice_party_identities party
       JOIN copyright_notices notice ON notice.id = party.copyright_notice_id
       WHERE party.account_user_id = identity.id) AS notice_clock
    FROM retained_user_identities identity WHERE identity.id = ${accountUserId}::uuid`)
  if (!rows[0]) throw new Error('Retained account identity is missing')
  return { pending: rows[0].pending, noticeClock: rows[0].notice_clock }
}

/** Drains the fixture's small action queue through the production processor after its lift. */
export async function settleCopyrightCasePurgeFixtureActions(noticeId: string): Promise<void> {
  const { rows } = await read<{ id: string }>(sql`
    /* readCopyrightCasePurgeFixtureActions */
    SELECT id FROM copyright_notice_action_work_items
    WHERE copyright_notice_id = ${noticeId}::uuid AND state IN ('pending', 'claimed', 'failed')
    ORDER BY id LIMIT 10`)
  for (const row of rows) {
    await processCopyrightActionIntent(row.id)
  }
}

export async function readCopyrightCasePurgeFixtureObject(key: string): Promise<{
  claimed: boolean
  generation: string
} | null> {
  const { rows } = await read<{ is_deletion_claimed: boolean; reference_generation: string }>(sql`
    /* readCopyrightCasePurgeFixtureObject */
    SELECT is_deletion_claimed, reference_generation::text
    FROM copyright_notice_storage_objects WHERE storage_key = ${key}`)
  return rows[0]
    ? { claimed: rows[0].is_deletion_claimed, generation: rows[0].reference_generation }
    : null
}

/** Whether the rationale retention sweep could retire this rationale as of now. */
export async function isCopyrightRationaleRetentionEligibleNow(id: string): Promise<boolean> {
  await using transaction = await beginTransaction()
  return await testRationaleRetentionEligible(transaction, id, new Date())
}

/** The subset of these rationale ids that still exist. */
export async function readExistingCopyrightRationaleIds(ids: string[]): Promise<string[]> {
  const { rows } = await read<{ id: string }>(
    sql`/* readExistingCopyrightRationaleIds */ SELECT id FROM copyright_decision_rationales WHERE id = ANY(${ids}::uuid[])`,
  )
  return rows.map(row => row.id)
}
