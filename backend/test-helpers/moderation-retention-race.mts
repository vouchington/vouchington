import type { OwnedTransaction } from '@data-stores/psql'
import { createTestPostgresLockWaiter } from './postgres-lock-waiter.mts'

/** Release the owned writer when the page waits, or after the page completes without waiting. */
export async function runTestRetentionWithCommitAtWait<Result>(options: {
  holder: OwnedTransaction
  marker: string
  binding: string | readonly string[]
  beforeCommit?: () => Promise<void>
  run: (query: OwnedTransaction) => Promise<Result>
}): Promise<Result> {
  await using waiter = await createTestPostgresLockWaiter({
    holder: options.holder,
    lock: { kind: 'transaction' },
    selected: { marker: options.marker, binding: { index: 0, value: options.binding } },
  })
  const operation = (async () => {
    const result = await options.run(waiter.query)
    await waiter.query.commit()
    return result
  })()
  let commit: Promise<unknown> | undefined
  const commitHolder = () =>
    (commit ??= (async () => {
      await options.beforeCommit?.()
      await options.holder.commit()
    })())
  await Promise.race([operation, waiter.waitForLock(operation).then(commitHolder)])
  await commitHolder()
  return await operation
}

export async function holdTestRetentionPostHash(postId: string, query: OwnedTransaction) {
  await query(
    `/* holdTestRetentionPostHash */
     SELECT id FROM posts WHERE id = $1::uuid FOR NO KEY UPDATE`,
    [postId],
  )
}
