import { beginTransaction } from '@data-stores/psql'
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
  normalizedCopyrightEmailReplyValues,
} from './email-thread-references.mts'
import { lockCopyrightOperationalThreadCase } from './operational-retention-thread-lock.mts'
import { insertCopyrightEmailIntakeNoticeLink } from './email-thread-link.mts'

export type { CopyrightEmailThreadMatch } from './email-thread-match.mts'

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
  }
  // Preserve the ingestion token-before-intake order. The intake lock fences a concurrent case
  // link while its case-level advisory lock fences the retirement sweep.
  const { rows: liveIntakes } = await transaction<{ raw_storage_object_id: string | null }>(sql`
    /* recordCopyrightEmailThreadReferences:lockIntake */
    SELECT raw_storage_object_id FROM copyright_notice_email_intakes
    WHERE id = ${input.intakeId}
      AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
        WHERE receipt.id = ${input.intakeId} AND receipt.erased_at IS NULL)
    FOR UPDATE`)
  if (!liveIntakes[0]?.raw_storage_object_id) {
    await transaction.commit()
    return null
  }
  const { rows: links } = await transaction<{ copyright_notice_id: string }>(sql`
    /* recordCopyrightEmailThreadReferences:caseLink */
    SELECT copyright_notice_id FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_receipt_id = ${input.intakeId}`)
  if (links[0]) {
    await lockCopyrightOperationalThreadCase(transaction, links[0].copyright_notice_id)
    const { rows: retired } = await transaction<{ copyright_notice_id: string }>(sql`
      /* recordCopyrightEmailThreadReferences:retired */
      SELECT copyright_notice_id FROM copyright_notice_email_thread_retirements
      WHERE copyright_notice_id = ${links[0].copyright_notice_id}
        AND retired_before_intake_bound > ${input.intakeId}::uuid`)
    if (retired.length > 0) {
      await transaction.commit()
      return null
    }
  }
  if (referenceRows.length > 0) {
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
    const linked = await insertCopyrightEmailIntakeNoticeLink(transaction, {
      intakeId: input.intakeId,
      noticeId: match.noticeId,
      linkKind: 'thread',
      matchedReference: match.matchedReference,
    })
    if (!linked) {
      await transaction.commit()
      return null
    }
  }
  await transaction.commit()
  return match
}
