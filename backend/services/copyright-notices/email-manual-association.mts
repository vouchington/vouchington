import { beginTransaction, read } from '@data-stores/psql'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailThreadChangedError } from './email-thread-graph.mts'
import { getCopyrightEmailThreadGraphMaxRows } from './config.mts'
import {
  copyrightEmailAncestorNoticeConflictSql,
  copyrightEmailDuplicateMessageIdSql,
  copyrightEmailReplyReferenceSql,
  copyrightEmailReviewPath,
} from './email-thread-review-path.mts'

type IntakeDecision = { id: string; linked: boolean; reviewed: boolean }

export type CopyrightNoticeAssociationTarget = {
  id: string
  jurisdiction: 'us_dmca' | 'eu_dsa' | 'uk'
  received_at: string
}

/** Resolve a staff-selected case by id without imposing the public accepted-case filter. */
export async function getCopyrightNoticeAssociationTarget(
  currentUser: PrivateUser,
  noticeId: string,
): Promise<CopyrightNoticeAssociationTarget | undefined> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  const { rows } = await read<CopyrightNoticeAssociationTarget>(sql`
    /* getCopyrightNoticeAssociationTarget */
    SELECT id, jurisdiction, received_at FROM copyright_notices notice
    WHERE id = ${noticeId}
      AND jurisdiction IN ('us_dmca', 'eu_dsa')
      AND NOT EXISTS (
      SELECT 1 FROM copyright_notice_retention_erasures erasure
      WHERE erasure.copyright_notice_id = notice.id
    )
  `)
  return rows[0]
}

/** Associate exactly one unresolved intake; later replies use the normal threading path. */
export async function associateCopyrightEmailIntakeWithNotice(
  currentUser: PrivateUser,
  intakeId: string,
  noticeId: string,
): Promise<{ copyright_notice: { id: string }; copyright_email_intake: { id: string } }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  await using transaction = await beginTransaction()
  const before = await readIntakeDecision(transaction, intakeId)
  assert(before, 404, 'Copyright email intake not found')
  if (before.linked || before.reviewed) throw copyrightEmailThreadChangedError()
  observeSharedDbScope(
    'associateCopyrightEmailIntakePreflight',
    { kind: 'ids', ids: [intakeId] },
    undefined,
    transaction,
  )

  const { rows: lockedIntakes } = await transaction<{ id: string }>(sql`
    /* associateCopyrightEmailIntakeWithNotice:lockIntake */
    SELECT id FROM copyright_notice_email_intakes WHERE id = ${intakeId} FOR UPDATE
  `)
  assert(lockedIntakes[0], 404, 'Copyright email intake not found')
  // Erasure updates only intakes already linked to its case. A link committed
  // while this lock was pending must be rejected before waiting for that case.
  const lockedDecision = await readIntakeDecision(transaction, intakeId)
  if (!lockedDecision || lockedDecision.linked || lockedDecision.reviewed)
    throw copyrightEmailThreadChangedError()
  const { rows: lockedNotices } = await transaction<{ id: string; jurisdiction: string }>(sql`
    /* associateCopyrightEmailIntakeWithNotice:lockNotice */
    SELECT id, jurisdiction FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `)
  assert(lockedNotices[0], 404, 'Copyright notice not found')
  assert(
    lockedNotices[0].jurisdiction === 'us_dmca' || lockedNotices[0].jurisdiction === 'eu_dsa',
    422,
    'Correspondence kind does not apply to this jurisdiction',
  )
  // A retention erasure takes the notice lock first. This fresh statement sees a marker
  // committed while this association waited and fences a new marker until commit.
  const { rows: erased } = await transaction(sql`
    /* associateCopyrightEmailIntakeWithNotice:erasure */
    SELECT 1 FROM copyright_notice_retention_erasures
    WHERE copyright_notice_id = ${noticeId} LIMIT 1
  `)
  assert(!erased[0], 404, 'Copyright notice not found')
  observeSharedDbScope(
    'associateCopyrightEmailIntakeLocked',
    { kind: 'ids', ids: [intakeId] },
    undefined,
    transaction,
  )

  const after = await readIntakeDecision(transaction, intakeId)
  if (!after || after.linked || after.reviewed) throw copyrightEmailThreadChangedError()
  const reviewPath = await readManualAssociationReviewPath(transaction, intakeId)
  assert(reviewPath !== 'initial', 409, 'Initial copyright email needs case approval')
  const { rows: links } = await transaction<{ id: string }>(sql`
    /* associateCopyrightEmailIntakeWithNotice:link */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind
    ) VALUES (${intakeId}, ${noticeId}, 'thread')
    ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
    RETURNING id
  `)
  if (!links[0]) throw copyrightEmailThreadChangedError()
  await transaction(sql`
    /* associateCopyrightEmailIntakeWithNotice:pendingReview */
    INSERT INTO copyright_notice_email_correspondence_reviews (
      copyright_notice_email_intake_id, copyright_notice_id, action
    ) VALUES (${intakeId}, ${noticeId}, 'pending')
  `)
  await transaction(sql`
    /* associateCopyrightEmailIntakeWithNotice:audit */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id, copyright_notice_email_intake_id
    ) VALUES (${noticeId}, 'email_intake_manually_associated', ${currentUser.id}, ${intakeId})
  `)
  await transaction.commit()
  return { copyright_notice: { id: noticeId }, copyright_email_intake: { id: intakeId } }
}

/** Eligibility is recomputed after both row locks; a new reply or claimant changes this result. */
async function readManualAssociationReviewPath(transaction: TransactionQuery, intakeId: string) {
  const maxGraphRows = await getCopyrightEmailThreadGraphMaxRows()
  const query = sql`/* readManualAssociationReviewPath */
    SELECT `
  query.append(copyrightEmailDuplicateMessageIdSql())
  query.append(sql` AS has_duplicate_message_id, `)
  query.append(copyrightEmailAncestorNoticeConflictSql(maxGraphRows))
  query.append(sql` AS has_ancestor_notice_conflict, `)
  query.append(copyrightEmailReplyReferenceSql())
  query.append(sql` AS has_reply_reference
    FROM copyright_notice_email_intakes intake WHERE intake.id = ${intakeId}`)
  const { rows } = await transaction<{
    has_duplicate_message_id: boolean
    has_ancestor_notice_conflict: boolean
    has_reply_reference: boolean
  }>(query)
  if (!rows[0]) throw copyrightEmailThreadChangedError()
  return copyrightEmailReviewPath({ link_kind: null, ...rows[0] })
}

async function readIntakeDecision(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<IntakeDecision | undefined> {
  const { rows } = await transaction<IntakeDecision>(sql`
    /* associateCopyrightEmailIntakeWithNotice:decision */
    SELECT intake.id,
      EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = intake.id) AS linked,
      EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
        WHERE review.copyright_notice_email_intake_id = intake.id) AS reviewed
    FROM copyright_notice_email_intakes intake WHERE intake.id = ${intakeId}
  `)
  return rows[0]
}
