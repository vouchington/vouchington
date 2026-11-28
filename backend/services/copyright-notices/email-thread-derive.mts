import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { collectKeysetPages } from './bounded-reads.mts'
import { getCopyrightSweepLimits } from './work-limits.mts'
import {
  copyrightEmailMessageIdIsAmbiguous,
  recordCopyrightEmailAncestorEdges,
} from './email-thread-ancestors.mts'
import {
  findCopyrightEmailThreadMatch,
  type CopyrightEmailThreadMatch,
} from './email-thread-match.mts'
import {
  normalizedCopyrightEmailReplyValues,
  type CopyrightEmailThreadInput,
  type CopyrightEmailThreadReferenceRow,
} from './email-thread-references.mts'
import { insertCopyrightEmailIntakeNoticeLink } from './email-thread-link.mts'
import {
  hasLiveCopyrightEmailSource,
  hasRetiredCopyrightEmailCaseLink,
} from './email-thread-source.mts'
import { throwIfCopyrightEmailThreadWriteConflict } from './email-thread-write-conflict.mts'

/** Derive from current committed facts; never assume the admission snapshot remains current. */
export async function deriveCopyrightEmailThread(
  input: CopyrightEmailThreadInput,
  referenceRows: readonly CopyrightEmailThreadReferenceRow[],
): Promise<CopyrightEmailThreadMatch | null> {
  try {
    return await deriveCopyrightEmailThreadInTransaction(input, referenceRows)
  } catch (err) {
    throwIfCopyrightEmailThreadWriteConflict(err)
    throw err
  }
}

async function deriveCopyrightEmailThreadInTransaction(
  input: CopyrightEmailThreadInput,
  referenceRows: readonly CopyrightEmailThreadReferenceRow[],
): Promise<CopyrightEmailThreadMatch | null> {
  await using transaction = await beginTransaction()
  if (!(await hasLiveCopyrightEmailSource(transaction, input.intakeId))) {
    await transaction.commit()
    return null
  }
  if (await hasRetiredCopyrightEmailCaseLink(transaction, input.intakeId)) {
    await transaction.commit()
    return null
  }
  const lookupDigests = referenceRows.map(row => row.lookup_digest)
  const currentTokens = await collectKeysetPages<{ id: string; lookup_digest: string }, string>(
    getCopyrightSweepLimits().batchSize,
    async (afterTokenId, limit) => {
      const { rows } = await transaction<{ id: string; lookup_digest: string }>(sql`
        /* recordCopyrightEmailThreadReferences:currentTokens */
        SELECT DISTINCT token.id, token.lookup_digest
        FROM copyright_notice_email_thread_references reference
        JOIN copyright_notice_email_thread_tokens token ON token.id = reference.token_id
        WHERE reference.copyright_notice_email_intake_id = ${input.intakeId}
          AND token.lookup_digest = ANY(${lookupDigests}::text[])
          AND (${afterTokenId}::uuid IS NULL OR token.id > ${afterTokenId}::uuid)
        ORDER BY token.id ASC
        LIMIT ${limit}
      `)
      return rows
    },
    row => row.id,
  )
  const tokenIds = new Map(currentTokens.map(row => [row.lookup_digest, row.id]))
  const ambiguous = await copyrightEmailMessageIdIsAmbiguous(transaction, input.intakeId)
  if (ambiguous) {
    await transaction.commit()
    return null
  }
  await recordCopyrightEmailAncestorEdges(transaction, input.intakeId)
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
