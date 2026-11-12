import { randomUUID } from 'node:crypto'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { createRetentionThreadSeedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { describe, expect, it, onTestFinished } from 'vitest'
import { deriveCopyrightEmailThread } from './email-thread-derive.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'

describe('mutual copyright email references', () => {
  it('writes reciprocal ancestor edges in one key order under concurrent derivation', async () => {
    const firstMessageId = `<first-${randomUUID()}@example.test>`
    const secondMessageId = `<second-${randomUUID()}@example.test>`
    const first = await createRetentionThreadSeedEmail('mutual-first', {
      messageId: firstMessageId,
      replyReferences: [secondMessageId],
    })
    const second = await createRetentionThreadSeedEmail('mutual-second', {
      messageId: secondMessageId,
      replyReferences: [firstMessageId],
    })
    const firstInput = {
      intakeId: first.id,
      messageId: firstMessageId,
      inReplyTo: [secondMessageId],
      references: [],
    }
    const secondInput = {
      intakeId: second.id,
      messageId: secondMessageId,
      inReplyTo: [firstMessageId],
      references: [],
    }
    expect(await readCopyrightEmailAncestorIds(first.id)).toEqual([])
    expect(await readCopyrightEmailAncestorIds(second.id)).toEqual([])

    const firstInserted = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    let holderProcessId: number | undefined
    const restore = afterPostgresTransactionQueryForTest(
      'recordCopyrightEmailAncestorEdges',
      values => values.includes(first.id),
      async transaction => {
        holderProcessId = await getTestPostgresBackendProcessId(transaction)
        firstInserted.resolve()
        await releaseFirst.promise
      },
    )
    onTestFinished(restore)
    const firstAttempt = deriveCopyrightEmailThread(
      firstInput,
      buildCopyrightEmailThreadReferenceRows(firstInput),
    )
    void firstAttempt.catch(firstInserted.reject)
    let outcomes: PromiseSettledResult<Awaited<typeof firstAttempt>>[]
    try {
      await firstInserted.promise
      if (holderProcessId === undefined) throw new Error('First edge write had no PostgreSQL owner')
      const secondOutcomes = await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'recordCopyrightEmailAncestorEdges',
          releaseHolder: async () => releaseFirst.resolve(),
        },
        async waitForLock => {
          const secondAttempt = deriveCopyrightEmailThread(
            secondInput,
            buildCopyrightEmailThreadReferenceRows(secondInput),
          )
          await waitForLock(secondAttempt)
          releaseFirst.resolve()
          return Promise.allSettled([secondAttempt])
        },
      )
      outcomes = [...(await Promise.allSettled([firstAttempt])), ...secondOutcomes]
    } finally {
      releaseFirst.resolve()
      await Promise.allSettled([firstAttempt])
      restore()
    }
    const values = outcomes.map(outcome =>
      outcome.status === 'fulfilled'
        ? { status: 'fulfilled', value: outcome.value }
        : {
            status: 'rejected',
            code: (outcome.reason as { code?: string }).code,
            causeCode: (outcome.reason as { cause?: { code?: string } }).cause?.code,
          },
    )
    for (const value of values)
      expect([
        { status: 'fulfilled', value: null },
        { status: 'rejected', code: COPYRIGHT_EMAIL_THREAD_CHANGED, causeCode: '40001' },
        { status: 'rejected', code: COPYRIGHT_EMAIL_THREAD_CHANGED, causeCode: '40P01' },
      ]).toContainEqual(value)
    const edges = {
      first: await readCopyrightEmailAncestorIds(first.id),
      second: await readCopyrightEmailAncestorIds(second.id),
    }
    expect([
      { outcomes: ['fulfilled', 'fulfilled'], edges: { first: [second.id], second: [first.id] } },
      { outcomes: ['fulfilled', 'rejected'], edges: { first: [second.id], second: [first.id] } },
      { outcomes: ['rejected', 'fulfilled'], edges: { first: [second.id], second: [first.id] } },
      { outcomes: ['rejected', 'rejected'], edges: { first: [], second: [] } },
    ]).toContainEqual({ outcomes: values.map(value => value.status), edges })
  })
})
