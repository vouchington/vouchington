import { beginTransaction, read, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** The registry identity currently referenced by one owned raw intake. */
export async function readTestCopyrightEmailStorage(intakeId: string) {
  const { rows } = await read<{
    id: string
    claimed: boolean
    generation: string
  }>(sql`/* readTestCopyrightEmailStorage */
    SELECT object.id, object.is_deletion_claimed AS claimed, object.reference_generation::text AS generation
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
    WHERE intake.id = ${intakeId}`)
  return rows[0] ?? null
}

/** Apply the same one-way registry mutation used by a selected deletion page. */
export async function claimTestCopyrightEmailStorage(
  noticeId: string,
  intakeId: string,
  query: TransactionQuery,
) {
  await query(sql`/* claimTestCopyrightEmailStorage:permit */
    SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_case_purge_table', 'copyright_notice_storage_objects', true)`)
  await query(sql`/* claimTestCopyrightEmailStorage */
    UPDATE copyright_notice_storage_objects object SET is_deletion_claimed = true
    FROM copyright_notice_email_intakes intake
    WHERE intake.id = ${intakeId} AND object.id = intake.raw_storage_object_id`)
}

/** Commit an object claim while a real link mutation waits on its generation UPDATE. */
export async function mutateCopyrightEmailAfterStorageClaim<Result>(
  noticeId: string,
  intakeId: string,
  queryMarker: string,
  mutate: () => Promise<Result>,
): Promise<Result> {
  await using claim = await beginTransaction()
  await claimTestCopyrightEmailStorage(noticeId, intakeId, claim)
  const holderProcessId = await getTestPostgresBackendProcessId(claim)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker,
      releaseHolder: () => claim[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = mutate()
      await waitForLock(pending)
      await claim.commit()
      return pending
    },
  )
}

/** Direct conflict replay exercises the canonical BEFORE/AFTER insert trigger boundary. */
export async function replayTestCopyrightEmailLink(noticeId: string, intakeId: string) {
  const { rowCount } = await write(sql`/* replayTestCopyrightEmailLink */
    INSERT INTO copyright_notice_email_intake_notice_links (copyright_notice_email_intake_id, copyright_notice_id, link_kind, correspondence_action)
    VALUES (${intakeId}, ${noticeId}, 'thread', 'pending')
    ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING`)
  return rowCount
}

/** An owned purge link deletion, optionally after retention cleared its original pointer. */
export async function deleteTestCopyrightEmailLink(
  noticeId: string,
  intakeId: string,
  clearOriginal = false,
) {
  await using query = await beginTransaction()
  await query(sql`/* deleteTestCopyrightEmailLink:permit */
    SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_case_purge_table', 'copyright_notice_email_intakes', true),
      set_config('app.copyright_retention_erasure', 'on', true)`)
  if (clearOriginal)
    await query(sql`/* deleteTestCopyrightEmailLink:clearOriginal */
    UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL WHERE id = ${intakeId}`)
  await query(sql`/* deleteTestCopyrightEmailLink:linkPermit */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_notice_email_intake_notice_links', true)`)
  const { rowCount } = await query(sql`/* deleteTestCopyrightEmailLink */
    DELETE FROM copyright_notice_email_intake_notice_links WHERE copyright_notice_id = ${noticeId} AND copyright_notice_email_intake_id = ${intakeId}`)
  await query.commit()
  return rowCount
}
