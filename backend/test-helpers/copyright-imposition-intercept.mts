import { onTestFinished } from 'vitest'
import { interceptPostgresTransactionQueriesForTest } from './injected-transaction-queries.mts'

/**
 * Run `hook` once, inside the nth (default first) real restriction imposition for `noticeId`,
 * after its transaction opened and before it takes any lock, then let the imposition run for
 * real. Throwing from `hook` fails that imposition through the real transaction; awaiting
 * another real write in it reproduces a concurrent writer. The interception is removed as soon
 * as it fires and when the test finishes.
 */
export function interceptCopyrightImpositionForTest(
  noticeId: string,
  hook: () => Promise<void>,
  nth = 1,
): void {
  let attempts = 0
  const restore = interceptPostgresTransactionQueriesForTest(
    (statement, values) =>
      statement.includes('acceptCopyrightNoticeAndImposeRestriction:findTarget') &&
      values.includes(noticeId),
    async () => {
      attempts += 1
      if (attempts !== nth) return
      restore()
      await hook()
    },
  )
  onTestFinished(restore)
}
