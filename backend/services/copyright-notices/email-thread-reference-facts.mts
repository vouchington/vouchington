import { beginTransaction } from '@data-stores/psql'
import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import {
  insertResolvedCopyrightEmailThreadReferences,
  resolveCopyrightEmailThreadTokenIds,
} from './email-thread-ancestors.mts'
import type { CopyrightEmailThreadReferenceRow } from './email-thread-references.mts'
import {
  hasLiveCopyrightEmailSource,
  hasRetiredCopyrightEmailCaseLink,
} from './email-thread-source.mts'

/** Admit keyed reference facts before deriving a best-effort graph from committed facts. */
export async function admitCopyrightEmailReferenceFacts(
  intakeId: string,
  referenceRows: readonly CopyrightEmailThreadReferenceRow[],
): Promise<boolean> {
  await using tokenTransaction = await beginTransaction()
  // A plain preflight avoids recreating orphan digests for already erased or retired replays.
  // The serializable transaction below remains the authoritative admission check.
  if (
    !(await hasLiveCopyrightEmailSource(tokenTransaction, intakeId)) ||
    (await hasRetiredCopyrightEmailCaseLink(tokenTransaction, intakeId))
  ) {
    await tokenTransaction.commit()
    return false
  }
  const tokenIds = await resolveCopyrightEmailThreadTokenIds(
    tokenTransaction,
    referenceRows.map(row => row.lookup_digest),
  )
  await tokenTransaction.commit()

  return await conflictOnSerializationFailure(async () => {
    await using transaction = await beginTransaction({ serializable: true })
    if (!(await hasLiveCopyrightEmailSource(transaction, intakeId))) {
      await transaction.commit()
      return false
    }
    if (await hasRetiredCopyrightEmailCaseLink(transaction, intakeId)) {
      await transaction.commit()
      return false
    }
    await insertResolvedCopyrightEmailThreadReferences(
      transaction,
      intakeId,
      referenceRows,
      tokenIds,
    )
    await transaction.commit()
    return true
  }, 'Copyright email thread changed; retry')
}
