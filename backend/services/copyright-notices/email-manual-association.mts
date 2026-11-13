import { assertCopyrightThreadAcceptsEvidence } from './thread-retirement-admission.mts'
import { beginTransaction } from '@data-stores/psql'
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

/** Associate exactly one unresolved intake; later replies use the normal threading path. */
export async function associateCopyrightEmailIntakeWithNotice(
  currentUser: PrivateUser,
  intakeId: string,
  noticeId: string,
): Promise<{ copyright_notice: { id: string }; copyright_email_intake: { id: string } }> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  try {
    await using transaction = await beginTransaction({ serializable: true })
    const before = await readIntakeDecision(transaction, intakeId)
    assert(before, 404, 'Copyright email intake not found')
    if (before.linked || before.reviewed) throw copyrightEmailThreadChangedError()
    observeSharedDbScope(
      'associateCopyrightEmailIntakePreflight',
      { kind: 'ids', ids: [intakeId] },
      undefined,
      transaction,
    )

    const { rows: notices } = await transaction<{ id: string; jurisdiction: string }>(sql`
    /* associateCopyrightEmailIntakeWithNotice:notice */
    SELECT id, jurisdiction FROM copyright_notices WHERE id = ${noticeId}
  `)
    assert(notices[0], 404, 'Copyright notice not found')
    assert(
      notices[0].jurisdiction === 'us_dmca' || notices[0].jurisdiction === 'eu_dsa',
      422,
      'Correspondence kind does not apply to this jurisdiction',
    )
    // The link trigger conditionally advances the case clock and rejects an erased case.
    const { rows: erased } = await transaction(sql`
    /* associateCopyrightEmailIntakeWithNotice:erasure */
    SELECT 1 FROM copyright_notices
    WHERE id = ${noticeId} AND evidence_erased_at IS NOT NULL LIMIT 1
  `)
    assert(!erased[0], 404, 'Copyright notice not found')
    observeSharedDbScope(
      'associateCopyrightEmailIntake',
      { kind: 'ids', ids: [intakeId] },
      undefined,
      transaction,
    )

    const after = await readIntakeDecision(transaction, intakeId)
    if (!after || after.linked || after.reviewed) throw copyrightEmailThreadChangedError()
    const reviewPath = await readManualAssociationReviewPath(transaction, intakeId)
    assert(reviewPath !== 'initial', 409, 'Initial copyright email needs case approval')
    await assertCopyrightThreadAcceptsEvidence(transaction, noticeId)
    const { rows: links } = await transaction<{ id: string }>(sql`
    /* associateCopyrightEmailIntakeWithNotice:link */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind, correspondence_action
    ) VALUES (${intakeId}, ${noticeId}, 'thread', 'pending')
    ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
    RETURNING id
  `)
    if (!links[0]) throw copyrightEmailThreadChangedError()
    await transaction(sql`
    /* associateCopyrightEmailIntakeWithNotice:audit */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id, copyright_notice_email_intake_id
    ) VALUES (${noticeId}, 'email_intake_manually_associated', ${currentUser.id}, ${intakeId})
  `)
    await transaction.commit()
    return { copyright_notice: { id: noticeId }, copyright_email_intake: { id: intakeId } }
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '40001')
      throw Object.assign(copyrightEmailThreadChangedError(), { cause: err })
    if ((err as { constraint?: string } | null)?.constraint === 'copyright_email_link_active_case')
      throw Object.assign(copyrightEmailThreadChangedError(), { cause: err })
    throw err
  }
}

/** Recompute eligibility from the transaction snapshot before inserting the immutable link. */
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
      receipt.review_decision IS NOT NULL AS reviewed
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
    WHERE intake.id = ${intakeId}
      AND intake.raw_storage_object_id IS NOT NULL AND receipt.erased_at IS NULL
  `)
  return rows[0]
}
