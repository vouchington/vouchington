import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import {
  createTestPostgresMultiWait,
  type TestPostgresMultiWaitAction,
} from './postgres-multi-client-lock-observer.mts'

export async function runOverlappingCopyrightFormWriters<Holder, Waiter>(input: {
  intakeId: string
  holderMarker: string
  waiterMarker: string
  holder: () => Promise<Holder>
  waiter: () => Promise<Waiter>
}): Promise<[Holder, Waiter]> {
  await using waits = await createTestPostgresMultiWait()
  let waiter: TestPostgresMultiWaitAction<Waiter> | undefined
  const restore = afterPostgresTransactionQueryForTest(
    input.holderMarker,
    values => values.includes(input.intakeId),
    async transaction => {
      waiter = await waits.start(
        {
          holderProcessId: await getTestPostgresBackendProcessId(transaction),
          pool: 'write',
          lock: { kind: 'advisory', key: `copyright-form-review:${input.intakeId}` },
          queryMarker: input.waiterMarker,
          releaseHolder: () => {},
        },
        input.waiter,
      )
      await waiter.waitForLock()
    },
  )
  try {
    const held = await input.holder()
    if (!waiter) throw new Error('Holder did not reach its owned database statement')
    return [held, await waiter.operation]
  } finally {
    restore()
  }
}
