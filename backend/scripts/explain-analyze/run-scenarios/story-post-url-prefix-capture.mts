import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { runAndCapture } from '../run-support.mts'

export async function captureRollback(
  id: string,
  annotation: string,
  run: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  await using query = await beginTransaction()
  await runAndCapture(id, () => run(query), undefined, annotation, {
    afterCapture: () => query.rollback(),
  })
}
