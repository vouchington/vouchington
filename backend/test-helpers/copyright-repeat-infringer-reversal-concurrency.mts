import type { TestCopyrightConnection } from './copyright-repeat-infringer-concurrency.mts'
import { withTestCopyrightAuthorLock } from './copyright-author-lock-owner.mts'

type Action = (connection: TestCopyrightConnection) => Promise<unknown>

/** Both actual transactions queue at their common author lock in the requested order. */
export async function raceTestCopyrightReversalAndEnforcement(input: {
  accountId: string
  operations: readonly [Action, Action]
}): Promise<PromiseSettledResult<unknown>[]> {
  return withTestCopyrightAuthorLock(input.accountId, 2, async owner => {
    const first = owner.start(0, input.operations[0])
    await first.wait()
    const second = owner.start(1, input.operations[1])
    // ast-grep-ignore: no-three-sequential-awaits -- Prove both live transactions are physically queued before releasing the common lock, then join both actual outcomes.
    await second.wait()
    await owner.release()
    return (await Promise.all([first.settled, second.settled])).flat()
  })
}
