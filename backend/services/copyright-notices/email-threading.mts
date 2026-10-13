import { beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  copyrightEmailMessageIdIsAmbiguous,
  insertCopyrightEmailThreadReferences,
  lockCopyrightEmailThreadTokens,
  recordCopyrightEmailAncestorEdges,
} from './email-thread-ancestors.mts'
import {
  findCopyrightEmailThreadMatch,
  type CopyrightEmailThreadMatch,
} from './email-thread-match.mts'
import {
  buildCopyrightEmailThreadReferenceRows,
  COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE,
  normalizedCopyrightEmailReplyValues,
} from './email-thread-references.mts'

export type { CopyrightEmailThreadMatch } from './email-thread-match.mts'

export async function recordCopyrightEmailThreadReferences(input: {
  intakeId: string
  messageId: string | null
  inReplyTo: string[]
  references: string[]
}): Promise<CopyrightEmailThreadMatch | null> {
  const referenceRows = buildCopyrightEmailThreadReferenceRows(input)
  await using transaction = await beginTransaction()
  if (referenceRows.length > 0) {
    // ast-grep-ignore: no-three-sequential-awaits -- token locks precede reference insertion, which must precede ancestor resolution in this transaction
    await lockCopyrightEmailThreadTokens(
      transaction,
      referenceRows.map(row => row.lookup_token),
    )
    await insertCopyrightEmailThreadReferences(transaction, input.intakeId, referenceRows)
    await recordCopyrightEmailAncestorEdges(transaction, input.intakeId)
  }
  const ambiguous = await copyrightEmailMessageIdIsAmbiguous(transaction, input.intakeId)
  await transaction.commit()
  if (ambiguous) return null
  const match = await findCopyrightEmailThreadMatch(
    input.intakeId,
    normalizedCopyrightEmailReplyValues(input),
  )
  if (match) {
    await linkCopyrightEmailIntakeToNotice({
      intakeId: input.intakeId,
      noticeId: match.noticeId,
      linkKind: 'thread',
      matchedReference: match.matchedReference,
    })
  }
  return match
}

export async function linkCopyrightEmailIntakeToNotice(input: {
  intakeId: string
  noticeId: string
  linkKind: 'initial' | 'thread'
  matchedReference?: string | null
}): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* linkCopyrightEmailIntakeToNotice */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind,
      matched_reference_lookup
    ) VALUES (
      ${input.intakeId}, ${input.noticeId}, ${input.linkKind},
      ${input.matchedReference ? hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, input.matchedReference) : null}
    ) ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
  `)
  if (input.linkKind === 'thread') {
    await transaction(sql`/* linkCopyrightEmailIntakeToNotice:pendingReview */
      INSERT INTO copyright_notice_email_correspondence_reviews (
        copyright_notice_email_intake_id, copyright_notice_id, action
      ) VALUES (${input.intakeId}, ${input.noticeId}, 'pending')
      ON CONFLICT (copyright_notice_email_intake_id, action) DO NOTHING
    `)
  }
  await transaction.commit()
}
