import {
  beginTransaction,
  read,
  writePool,
  type OwnedTransaction,
  type PoolClient,
  type QueryExecutor,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeTestTransactionLockNotice } from './postgres-advisory-lock-notice.mts'

/** Holds the real orphan-check result while a second connection releases its session reference. */
export async function runTestUserAgentReleaseDuringCleanup<Page>(options: {
  sessionId: string
  cleanup: (query: TransactionQuery) => Promise<Page>
}): Promise<{ page: Page; releaseBlocked: boolean }> {
  const holder = await beginTransaction()
  const checked = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  let client: PoolClient | undefined
  let contender: OwnedTransaction | undefined
  let observer: ReturnType<typeof observeTestTransactionLockNotice> | undefined
  let cleanupOutcome: Promise<[PromiseSettledResult<Page>]> | undefined
  let releaseOutcome: Promise<[PromiseSettledResult<unknown>]> | undefined
  const close = async () => {
    resume.resolve()
    const failures: unknown[] = []
    const settle = async (pending: PromiseLike<unknown> | undefined) => {
      try {
        await pending
      } catch (err) {
        failures.push(err)
      }
    }
    await settle(holder[Symbol.asyncDispose]())
    await settle(cleanupOutcome)
    await settle(releaseOutcome)
    await settle(contender?.[Symbol.asyncDispose]())
    await settle(observer?.close())
    const failure = failures.length
      ? new AggregateError(failures, 'User-agent cleanup release fixture failed to close')
      : undefined
    client?.release(failure)
    if (failure) throw failure
  }
  try {
    const { rows } = await holder<{ transaction_id: string }>(sql`
      /* runTestUserAgentReleaseDuringCleanup.identity */
      SELECT pg_current_xact_id()::text AS transaction_id
    `)
    const transactionId = rows[0]?.transaction_id
    if (!transactionId) throw new Error('Cleanup transaction has no PostgreSQL transaction ID')
    let observedCheck = false
    const gatedQuery: TransactionQuery = new Proxy(holder, {
      apply(target, thisArg, args: Parameters<QueryExecutor>) {
        const pending: ReturnType<QueryExecutor> = Reflect.apply(target, thisArg, args)
        const input = args[0]
        const text = typeof input === 'string' ? input : input.text
        if (!text.includes('/* deleteOrphanedUserAgentStrings */')) return pending
        if (observedCheck) throw new Error('Cleanup checked the same user agent twice')
        observedCheck = true
        return pending.then(async result => {
          checked.resolve()
          await resume.promise
          return result
        })
      },
    })
    cleanupOutcome = Promise.allSettled([options.cleanup(gatedQuery)] as const)
    await Promise.race([
      checked.promise,
      cleanupOutcome.then(([result]) => {
        if (result.status === 'rejected') throw result.reason
        throw new Error('Cleanup finished without checking the user-agent reference')
      }),
    ])

    client = await writePool.connect()
    observer = observeTestTransactionLockNotice(client, transactionId)
    await observer.ready
    contender = await beginTransaction({ client })
    releaseOutcome = Promise.allSettled([
      contender(sql`/* runTestUserAgentReleaseDuringCleanup.release */
        DELETE FROM user_sessions WHERE id = ${options.sessionId}`),
    ] as const)
    let releaseBlocked = true
    try {
      await observer.wait(releaseOutcome)
    } catch {
      const [result] = await releaseOutcome
      if (result.status === 'rejected') throw result.reason
      releaseBlocked = false
      await contender.commit()
    }

    resume.resolve()
    const [result] = await cleanupOutcome
    if (result.status === 'rejected') throw result.reason
    await holder.commit()
    if (releaseBlocked) {
      const [released] = await releaseOutcome
      if (released.status === 'rejected') throw released.reason
      await contender.commit()
    }
    return { page: result.value, releaseBlocked }
  } finally {
    await close()
  }
}

export async function hasTestUserAgentStringCleanupCandidate(id: string): Promise<boolean> {
  const { rows } = await read<{ present: boolean }>(sql`
    /* hasTestUserAgentStringCleanupCandidate */
    SELECT EXISTS (
      SELECT 1 FROM user_agent_string_cleanup_candidates WHERE user_agent_string_id = ${id}
    ) AS present
  `)
  return rows[0]?.present ?? false
}

/** Commits a reference release only after another connection has checked the candidate. */
export async function runTestUserAgentReleaseBeforeCleanup<Page>(options: {
  sessionId: string
  cleanup: () => Promise<Page>
}): Promise<Page> {
  await using release = await beginTransaction()
  await release(sql`/* runTestUserAgentReleaseBeforeCleanup.release */
    DELETE FROM user_sessions WHERE id = ${options.sessionId}`)
  const page = await options.cleanup()
  await release.commit()
  return page
}
