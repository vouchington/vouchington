import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { linkCopyrightEmailIntakeToNotice } from './copyright-email-intake-link.mts'
import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import { searchCopyrightNoticeAssociationTargets } from '../services/copyright-notices/association-search.mts'
import { associateCopyrightEmailIntakeWithNotice } from '../services/copyright-notices/email-manual-association.mts'
import { commitCopyrightWritersInOrder } from './copyright-form-review-assessment-race.mts'

/** Establish the sibling snapshot, then commit the selected insertion before sibling graph DML. */
export async function associateAndThreadCopyrightEmail(
  currentUser: PrivateUser,
  intakeId: string,
  noticeId: string,
  first: 'manual' | 'thread',
) {
  const manual = () => associateCopyrightEmailIntakeWithNotice(currentUser, intakeId, noticeId)
  const thread = () => linkCopyrightEmailIntakeToNotice({ intakeId, noticeId, linkKind: 'thread' })
  const [winner, loser] = await commitCopyrightWritersInOrder(
    first === 'manual' ? manual : thread,
    first === 'manual' ? thread : manual,
    first === 'manual'
      ? 'associateCopyrightEmailIntakeWithNotice:link'
      : 'linkCopyrightEmailIntakeToNotice',
    first === 'manual'
      ? 'linkCopyrightEmailIntakeToNotice'
      : 'associateCopyrightEmailIntakeWithNotice:link',
    intakeId,
    [intakeId, noticeId],
  )
  const threaded = first === 'thread' ? winner : loser
  if (threaded.status === 'rejected') throw threaded.reason
  return { threaded: threaded.value, manual: first === 'manual' ? winner : loser }
}

/** The smallest accepted case row for a staff association boundary. */
export async function createCopyrightNoticeForManualAssociation(
  accepted = true,
  jurisdiction: 'us_dmca' | 'eu_dsa' | 'uk' | 'other' = 'us_dmca',
  workDescription = `work-${randomUUID()}`,
  noticeId?: string,
  claimantDisplayName: string | null = null,
  receivedAt?: Date,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`
    /* createCopyrightNoticeForManualAssociation */
    INSERT INTO copyright_notices (
      id, jurisdiction, legal_basis, received_at, accepted_at,
      claimant_display_name, claimant_contact_ciphertext, work_description, policy_version
    ) VALUES (
      COALESCE(${noticeId ?? null}::uuid, uuidv7()), ${jurisdiction}, 'copyright',
      COALESCE(${receivedAt ?? null}::timestamptz, CURRENT_TIMESTAMP),
      CASE WHEN ${accepted} THEN CURRENT_TIMESTAMP ELSE NULL END,
      ${claimantDisplayName}, ${`cipher-${randomUUID()}`}, ${workDescription}, 'test-v1'
    ) RETURNING id
  `)
  return rows[0]!.id
}

/** Read only the immutable staff association event for this intake. */
export async function readCopyrightEmailManualAssociationEvent(intakeId: string) {
  const { rows } = await read<{
    copyright_notice_id: string
    changed_by_id: string
    copyright_notice_email_intake_id: string
  }>(sql`
    /* readCopyrightEmailManualAssociationEvent */
    SELECT copyright_notice_id, changed_by_id, copyright_notice_email_intake_id
    FROM copyright_notice_lifecycle_changes
    WHERE copyright_notice_email_intake_id = ${intakeId}
      AND change_type = 'email_intake_manually_associated'
  `)
  return rows
}

export async function readCopyrightEmailManualAssociationReview(intakeId: string) {
  const { rows } = await read<{ copyright_notice_id: string; action: string }>(sql`
    /* readCopyrightEmailManualAssociationReview */
    SELECT copyright_notice_id, correspondence_action AS action
    FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_id = ${intakeId}
      AND correspondence_action IS NOT NULL
  `)
  return rows
}

/** Exercise the actor and case/intake FK constraints without bypassing the real table. */
export function insertCopyrightEmailManualAssociationEvent(
  noticeId: string,
  intakeId: string,
  actorId: string | null,
) {
  return write(sql`
    /* insertCopyrightEmailManualAssociationEvent */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id, copyright_notice_email_intake_id
    ) VALUES (${noticeId}, 'email_intake_manually_associated', ${actorId}, ${intakeId})
  `)
}

/** Record the erasure fact with the same written-row lock as the final evidence marker. */
export async function markTestCopyrightNoticeErased(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<void> {
  await transaction(sql`/* markTestCopyrightNoticeErased:fact */
    UPDATE copyright_notices SET evidence_erased_at = clock_timestamp()
    WHERE id = ${noticeId}`)
}

/** Commit the erasure fact before a new inbound reply is parsed. */
export async function markTestCopyrightNoticeErasedAndCommit(noticeId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await markTestCopyrightNoticeErased(noticeId, transaction)
  await transaction.commit()
}

/** Runs the real search under a transaction-local session timezone, then rolls it back. */
export async function searchTestCopyrightAssociationsInTimeZone(
  currentUser: PrivateUser,
  query: string,
  after: string,
  timeZone: 'America/Los_Angeles' | 'Asia/Tokyo',
) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* searchTestCopyrightAssociationsInTimeZone */
    SELECT set_config('TimeZone', ${timeZone}, true)`)
  return await searchCopyrightNoticeAssociationTargets(currentUser, query, after, {
    query: transaction,
  })
}

/** Commit a selected erasure while the real link's existing case-clock write is pending. */
export async function associateCopyrightEmailAfterErasure<Result>(
  noticeId: string,
  associate: () => Promise<Result>,
  queryMarker = 'associateCopyrightEmailIntakeWithNotice:link',
): Promise<Result> {
  await using erasure = await beginTransaction()
  await markTestCopyrightNoticeErased(noticeId, erasure)
  const processId = await getTestPostgresBackendProcessId(erasure)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: processId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker,
      releaseHolder: () => erasure[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = associate()
      await waitForLock(pending)
      await erasure.commit()
      return pending
    },
  )
}

/** Publish a real link while an already selected marker page waits for its written case. */
export async function purgeCopyrightCaseAfterEmailLink<Result>(
  intakeId: string,
  noticeId: string,
  purge: () => Promise<Result>,
): Promise<Result> {
  await using linking = await beginTransaction()
  await linkCopyrightEmailIntakeToNotice({ intakeId, noticeId, linkKind: 'thread' }, linking)
  const processId = await getTestPostgresBackendProcessId(linking)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: processId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'readCopyrightCasePurgeProof',
      releaseHolder: () => linking[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = purge()
      await waitForLock(pending)
      await linking.commit()
      return pending
    },
  )
}

/** Read the durable erasure fact, including while the private staff aggregate hides it. */
export async function isTestCopyrightCaseEvidenceErased(noticeId: string): Promise<boolean> {
  const { rows } = await read<{ erased: boolean }>(sql`/* isTestCopyrightCaseEvidenceErased */
    SELECT evidence_erased_at IS NOT NULL AS erased FROM copyright_notices WHERE id = ${noticeId}`)
  if (!rows[0]) throw new Error('Owned copyright notice is missing')
  return rows[0].erased
}
