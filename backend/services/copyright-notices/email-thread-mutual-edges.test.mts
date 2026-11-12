import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  linkTestCopyrightEmailIntake,
  seedCopyrightThreadRetirement,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
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
  it.each(['reply', 'ancestor'] as const)(
    'rolls back a new edge when its other %s endpoint belongs to a retired case',
    async direction => {
      const currentCase = await createRetentionMinimalCase()
      const retiredCase = await createRetentionMinimalCase()
      const currentMessage = `<current-${randomUUID()}@example.test>`
      const otherMessage = `<other-${randomUUID()}@example.test>`
      const input = {
        messageId: currentMessage,
        inReplyTo: direction === 'ancestor' ? [otherMessage] : [],
        references: [],
      }
      const current = await createRetentionThreadSeedEmail('live-endpoint', {
        messageId: currentMessage,
        replyReferences: input.inReplyTo,
      })
      const other = await createRetentionThreadSeedEmail('retired-endpoint', {
        messageId: otherMessage,
        replyReferences: direction === 'reply' ? [currentMessage] : [],
      })
      await linkTestCopyrightEmailIntake(current.id, currentCase.noticeId)
      await linkTestCopyrightEmailIntake(other.id, retiredCase.noticeId)
      await seedCopyrightThreadRetirement(retiredCase.noticeId, other.id)
      const currentBefore = await readCopyrightEmailAncestorIds(current.id)
      const otherBefore = await readCopyrightEmailAncestorIds(other.id)
      await expect(
        deriveCopyrightEmailThread(
          { intakeId: current.id, ...input },
          buildCopyrightEmailThreadReferenceRows(input),
        ),
      ).rejects.toMatchObject({ status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED })
      expect(await readCopyrightEmailAncestorIds(current.id)).toEqual(currentBefore)
      expect(await readCopyrightEmailAncestorIds(other.id)).toEqual(otherBefore)
      expect(await readCopyrightEmailIntakeNoticeLinks(current.id)).toEqual([
        { copyright_notice_id: currentCase.noticeId, link_kind: 'initial' },
      ])
      expect(await readCopyrightEmailIntakeNoticeLinks(other.id)).toEqual([
        { copyright_notice_id: retiredCase.noticeId, link_kind: 'initial' },
      ])
    },
  )

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
