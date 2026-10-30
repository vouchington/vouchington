import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { beginTransaction, read, type TransactionQuery } from '@data-stores/psql'
import { beforeEach, vi } from 'vitest'
import { Readable } from 'node:stream'
import sql from 'sql-template-strings'
import { openCopyrightOwnerSecretBatch } from '../services/copyright-notices/encryption-key-batch.mts'
import { linkCopyrightEmailIntakeToNotice } from './copyright-email-intake-link.mts'

type Deferred<T> = ReturnType<typeof Promise.withResolvers<T>>

/** Wraps the existing retention-bucket SDK fake and pauses one raw-evidence GetObject. */
export function useCopyrightEvidenceGetBarrier(): {
  blockNextGet(key: string, bytes: Buffer): { started: Promise<void>; release: () => void }
} {
  let next: {
    key: string
    bytes: Buffer
    started: Deferred<void>
    release: Deferred<void>
  } | null = null
  beforeEach(() => {
    next = null
    const send = vi.spyOn(S3Client.prototype, 'send')
    const delegate = send.getMockImplementation()
    if (!delegate) throw new Error('The copyright retention S3 fixture must be installed first')
    send.mockImplementation((async (command: unknown) => {
      const barrier = next
      if (barrier && command instanceof GetObjectCommand && command.input.Key === barrier.key) {
        next = null
        barrier.started.resolve()
        await barrier.release.promise
        return {
          Body: Readable.from([barrier.bytes]),
          ContentLength: barrier.bytes.byteLength,
        }
      }
      return delegate(command as never, {} as never, undefined as never)
    }) as never)
  })
  return {
    blockNextGet(key, bytes) {
      const started = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      next = { key, bytes, started, release }
      return { started: started.promise, release: () => release.resolve() }
    },
  }
}

/** Read the production advisory key with a real transaction-scoped try-exclusive lock. */
export async function tryCopyrightCaseErasureExclusiveLock(noticeId: string): Promise<boolean> {
  await using query = await beginTransaction()
  const { rows } = await query<{ locked: boolean }>(sql`/* tryCopyrightCaseErasureExclusiveLock */
    SELECT pg_try_advisory_xact_lock(hashtextextended(
      'copyright-erasure:' || ${noticeId}::uuid::text, 0)) AS locked`)
  await query.commit()
  return rows[0]?.locked ?? false
}

/**
 * Commit a real thread link after a key batch's initially empty lifetime lookup, then acquire the
 * case lock before the batch locks its intake row and repeats the lookup.
 */
export async function raceCopyrightIntakeLinkWithOwnerBatch(input: {
  intakeId: string
  noticeId: string
}): Promise<{
  linkCommittedDuringRace: boolean
  committedLinkExists: boolean
  batchError: string
}> {
  await using transaction = await beginTransaction()

  const initialLookupComplete = Promise.withResolvers<void>()
  const resumeBatch = Promise.withResolvers<void>()
  let paused = false
  const query = new Proxy(transaction, {
    apply(target, thisArgument, argumentsList: Parameters<TransactionQuery>) {
      return (async () => {
        const result = await Reflect.apply(target, thisArgument, argumentsList)
        const statement = argumentsList[0]
        const text = typeof statement === 'string' ? statement : statement.text
        if (!paused && text.includes('/* lockCopyrightIntakeCaseLifetimes */')) {
          const rows = (result as { rows?: unknown[] }).rows
          if (rows?.length)
            throw new Error('The intake lifetime fixture was linked before the initial lookup')
          paused = true
          initialLookupComplete.resolve()
          await resumeBatch.promise
        }
        return result
      })()
    },
  }) as TransactionQuery

  let batchError = ''
  const batch = openCopyrightOwnerSecretBatch([{ kind: 'intake', id: input.intakeId }], query)
    .then(async scopes => {
      await scopes[Symbol.asyncDispose]()
      return 'opened'
    })
    .catch(err => {
      batchError = err instanceof Error ? err.message : String(err)
      return 'rejected'
    })
  const completed = Promise.withResolvers<'completed'>()
  void batch.then(() => completed.resolve('completed'))
  let erasure: Awaited<ReturnType<typeof beginTransaction>> | undefined
  let linkCommittedDuringRace = false
  try {
    const reached = await Promise.race([
      initialLookupComplete.promise.then(() => 'initial-lookup' as const),
      completed.promise,
    ])
    if (reached !== 'initial-lookup')
      throw new Error(`Owner batch completed before the intake lock barrier: ${batchError}`)
    linkCommittedDuringRace = await linkCopyrightEmailIntakeToNotice({
      intakeId: input.intakeId,
      noticeId: input.noticeId,
      linkKind: 'thread',
    })
    erasure = await beginTransaction()
    await erasure(sql`/* holdCopyrightCaseErasureExclusiveForAdmissionRace */
      SELECT pg_advisory_xact_lock(hashtextextended(
        'copyright-erasure:' || ${input.noticeId}::uuid::text, 0))`)
  } finally {
    resumeBatch.resolve()
  }
  await batch
  await transaction.rollback()
  if (!erasure) throw new Error('The admission race did not acquire its erasure lock')
  await erasure.commit()
  const { rows } = await read<{ linked: boolean }>(sql`/* readCopyrightIntakeRaceLink */
    SELECT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_receipt_id = ${input.intakeId}) AS linked`)
  return {
    linkCommittedDuringRace,
    committedLinkExists: rows[0]?.linked ?? false,
    batchError,
  }
}
