import { vi } from 'vitest'
import sql from 'sql-template-strings'
import { psql, read, type QueryExecutor } from '@data-stores/psql'
import { createOutboundCopyrightCorrespondence } from '../services/copyright-notices/correspondence.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** A real correspondence writer contends with a purge page holding its checked case. */
export function raceCopyrightPurgeWithCorrespondence<Page>(
  noticeId: string,
  page: () => Promise<Page>,
) {
  return raceCopyrightRetentionWithCorrespondence(noticeId, page, 'purge')
}

/** A real correspondence writer contends with a thread erasure page holding its checked case. */
export async function raceCopyrightThreadWithCorrespondence<Page>(
  noticeId: string,
  page: () => Promise<Page>,
) {
  const { pageOutcome, message } = await raceCopyrightRetentionWithCorrespondence(
    noticeId,
    page,
    'thread',
  )
  if (pageOutcome.status === 'rejected') throw pageOutcome.reason
  return { page: pageOutcome.value, message }
}

function interceptBoundedRetentionTransaction(
  wrap: <Tx extends QueryExecutor>(transaction: Tx) => Tx,
) {
  const realBegin = psql.beginBoundedTransaction
  const spy = vi
    .spyOn(psql, 'beginBoundedTransaction')
    .mockImplementation(async options => wrap(await realBegin(options)))
  return () => spy.mockRestore()
}

function interceptThreadTransaction(wrap: <Tx extends QueryExecutor>(transaction: Tx) => Tx) {
  const realBegin = psql.beginTransaction
  const spy = vi
    .spyOn(psql, 'beginTransaction')
    .mockImplementation(async options => wrap(await realBegin(options)))
  return () => spy.mockRestore()
}

/** A real correspondence writer contends with a purge page holding its checked case. */
async function raceCopyrightRetentionWithCorrespondence<Page>(
  noticeId: string,
  purge: () => Promise<Page>,
  kind: 'purge' | 'thread',
) {
  const ready = Promise.withResolvers<number>()
  const release = Promise.withResolvers<void>()
  let captured = false
  const wrap = <Transaction extends QueryExecutor>(transaction: Transaction): Transaction =>
    new Proxy(transaction, {
      async apply(target, receiver, args: Parameters<QueryExecutor>) {
        const result = await Reflect.apply(target, receiver, args)
        const [statement] = args
        const text = typeof statement === 'string' ? statement : statement.text
        const values = typeof statement === 'string' ? [] : statement.values
        const boundary = text.includes('lockCopyrightActionGenerationForWrite')
        if (!captured && boundary && values.includes(noticeId)) {
          captured = true
          ready.resolve(await getTestPostgresBackendProcessId(target))
          await release.promise
        }
        return result
      },
    })
  const restore =
    kind === 'purge' ? interceptBoundedRetentionTransaction(wrap) : interceptThreadTransaction(wrap)
  const page = purge()
  const pageSettled = Promise.allSettled([page])
  void page
    .then(() =>
      ready.reject(new Error('Retention page exited before its actual generation write lock')),
    )
    .catch(ready.reject)
  try {
    const holderProcessId = await ready.promise
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        // Observe the owned transaction wait, whether it is on GEN or the notice clock.
        queryMarker: 'Copyright',
        releaseHolder: async () => {
          release.resolve()
          await pageSettled
        },
      },
      async waitForWrite => {
        const writer = createOutboundCopyrightCorrespondence({
          noticeId,
          submissionId: null,
          correspondenceKind: 'status_update',
          compositionKind: 'staff',
          bodyCiphertext: `purge-race-${crypto.randomUUID()}`,
          draftedById: null,
        })
        const writerSettled = Promise.allSettled([writer])
        await waitForWrite(writer)
        release.resolve()
        const [[pageOutcome], [writerOutcome]] = await Promise.all([pageSettled, writerSettled])
        if (writerOutcome.status === 'rejected') throw writerOutcome.reason
        return { pageOutcome, message: writerOutcome.value }
      },
    )
  } finally {
    release.resolve()
    restore()
    await pageSettled
  }
}

/** The purge pointer cut removes current assessment authority while retaining the source rows. */
export async function readCopyrightPurgeAssessmentPointers(noticeId: string) {
  const { rows } = await read<{ total: number; remaining: number }>(sql`
    /* readCopyrightPurgeAssessmentPointers */
    SELECT count(*)::integer AS total,
      count(current_assessment_identity_id)::integer AS remaining
    FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId}::uuid`)
  return rows[0]!
}

/** Commits a real legal writer after the page's SSI snapshot, before its first GEN write. */
export async function commitCopyrightCorrespondenceAfterPurgeSnapshot<Result>(
  noticeId: string,
  operation: () => Promise<Result>,
) {
  const { observeTestPostgresClientQueries } = await import('./postgres-query-pool-observer.mts')
  let message: Awaited<ReturnType<typeof createOutboundCopyrightCorrespondence>> | undefined
  let applied = false
  let failure: unknown
  const restore = interceptBoundedRetentionTransaction(
    transaction =>
      new Proxy(transaction, {
        async apply(target, receiver, args: Parameters<QueryExecutor>) {
          try {
            return await Reflect.apply(target, receiver, args)
          } catch (err) {
            failure = err
            throw err
          }
        },
      }),
  )
  try {
    const { result } = await observeTestPostgresClientQueries(operation, async query => {
      if (
        !applied &&
        query.text.includes('readPendingCopyrightAccountClockSync') &&
        query.values.includes(noticeId)
      ) {
        applied = true
        message = await createOutboundCopyrightCorrespondence({
          noticeId,
          submissionId: null,
          correspondenceKind: 'status_update',
          compositionKind: 'staff',
          bodyCiphertext: `retention-snapshot-${crypto.randomUUID()}`,
          draftedById: null,
        })
      }
    })
    return { result, message, failure }
  } finally {
    restore()
  }
}
