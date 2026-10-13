import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  copyrightEmailMessageIdIsAmbiguous,
  insertCopyrightEmailThreadReferences,
  lockCopyrightEmailThreadTokens,
  recordCopyrightEmailAncestorEdges,
  resolveCopyrightEmailThreadTokenIds,
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

type CopyrightEmailIntakeNoticeLink = {
  intakeId: string
  noticeId: string
  linkKind: 'initial' | 'thread'
  matchedReference?: string | null
}

export async function recordCopyrightEmailThreadReferences(input: {
  intakeId: string
  messageId: string | null
  inReplyTo: string[]
  references: string[]
}): Promise<CopyrightEmailThreadMatch | null> {
  const referenceRows = buildCopyrightEmailThreadReferenceRows(input)
  await using transaction = await beginTransaction()
  let tokenIds = new Map<string, string>()
  if (referenceRows.length > 0) {
    // ast-grep-ignore: no-three-sequential-awaits -- token locks precede reference insertion, which must precede ancestor resolution in this transaction
    await lockCopyrightEmailThreadTokens(
      transaction,
      referenceRows.map(row => row.lookup_digest),
    )
    tokenIds = await insertCopyrightEmailThreadReferences(
      transaction,
      input.intakeId,
      referenceRows,
    )
  }
  const ambiguous = await copyrightEmailMessageIdIsAmbiguous(transaction, input.intakeId)
  if (ambiguous) {
    await transaction.commit()
    return null
  }
  if (referenceRows.length > 0) {
    await recordCopyrightEmailAncestorEdges(transaction, input.intakeId)
  }
  const match = await findCopyrightEmailThreadMatch(
    input.intakeId,
    normalizedCopyrightEmailReplyValues(input),
    tokenIds,
    transaction,
  )
  if (match) {
    await linkCopyrightEmailIntakeToNotice(
      {
        intakeId: input.intakeId,
        noticeId: match.noticeId,
        linkKind: 'thread',
        matchedReference: match.matchedReference,
      },
      transaction,
    )
  }
  await transaction.commit()
  return match
}

export async function linkCopyrightEmailIntakeToNotice(
  input: CopyrightEmailIntakeNoticeLink,
  transaction?: TransactionQuery,
): Promise<void> {
  if (transaction) {
    await insertCopyrightEmailIntakeNoticeLink(transaction, input)
    return
  }
  await using owned = await beginTransaction()
  await insertCopyrightEmailIntakeNoticeLink(owned, input)
  await owned.commit()
}

async function insertCopyrightEmailIntakeNoticeLink(
  transaction: TransactionQuery,
  input: CopyrightEmailIntakeNoticeLink,
): Promise<void> {
  let matchedTokenId: string | null = null
  if (input.matchedReference) {
    const digest = hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, input.matchedReference)
    await lockCopyrightEmailThreadTokens(transaction, [digest])
    matchedTokenId = (await resolveCopyrightEmailThreadTokenIds(transaction, [digest])).get(digest)!
  }
  await transaction(sql`/* linkCopyrightEmailIntakeToNotice */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind,
      matched_token_id
    ) VALUES (
      ${input.intakeId}, ${input.noticeId}, ${input.linkKind},
      ${matchedTokenId}
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
}
