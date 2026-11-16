import type { TransactionQuery } from '@data-stores/psql'
import {
  insertResolvedCopyrightEmailThreadReferences,
  resolveCopyrightEmailThreadTokenIds,
} from './email-thread-ancestors.mts'
import type { CopyrightEmailThreadReferenceRow } from './email-thread-references.mts'
import { copyrightEmailThreadChangedError } from './email-thread-graph.mts'
import {
  hasLiveCopyrightEmailSource,
  hasRetiredCopyrightEmailCaseLink,
} from './email-thread-source.mts'
import { throwIfCopyrightEmailThreadWriteConflict } from './email-thread-write-conflict.mts'

/** Admit immutable header facts in the transaction that first inserts their parse. */
export async function admitCopyrightEmailReferenceFacts(
  transaction: TransactionQuery,
  intakeId: string,
  referenceRows: readonly CopyrightEmailThreadReferenceRow[],
): Promise<void> {
  if (referenceRows.length === 0) return
  try {
    if (
      !(await hasLiveCopyrightEmailSource(transaction, intakeId)) ||
      (await hasRetiredCopyrightEmailCaseLink(transaction, intakeId))
    )
      throw copyrightEmailThreadChangedError()
    const tokenIds = await resolveCopyrightEmailThreadTokenIds(
      transaction,
      referenceRows.map(row => row.lookup_digest),
    )
    await insertResolvedCopyrightEmailThreadReferences(
      transaction,
      intakeId,
      referenceRows,
      tokenIds,
    )
    // A linked reference actually updates case activity in its insert trigger. That write
    // remains held while this fresh read checks a retirement that won the race.
    if (await hasRetiredCopyrightEmailCaseLink(transaction, intakeId))
      throw copyrightEmailThreadChangedError()
  } catch (err) {
    throwIfCopyrightEmailThreadWriteConflict(err)
    throw err
  }
}
