import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { linkTestCopyrightEmailIntake } from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionThreadSeedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { describe, expect, it, onTestFinished } from 'vitest'
import { recordCopyrightEmailAncestorEdges } from './email-thread-ancestors.mts'
import { insertCopyrightEmailIntakeNoticeLink } from './email-thread-link.mts'

describe('copyright inbound reply write order', () => {
  it('commits both edge and case link for two replies to the same parent', async () => {
    const notice = await createRetentionMinimalCase()
    const parentMessageId = `<parent-${randomUUID()}@example.test>`
    const parent = await createRetentionThreadSeedEmail('inbound-parent', {
      sesMessageId: notice.initialEmailSesMessageId,
      messageId: parentMessageId,
    })
    await linkTestCopyrightEmailIntake(parent.id, notice.noticeId)
    const first = await createRetentionThreadSeedEmail('inbound-first', {
      messageId: `<first-${randomUUID()}@example.test>`,
      replyReferences: [parentMessageId],
    })
    const second = await createRetentionThreadSeedEmail('inbound-second', {
      messageId: `<second-${randomUUID()}@example.test>`,
      replyReferences: [parentMessageId],
    })
    const link = async (intakeId: string) => {
      await using transaction = await beginTransaction()
      await recordCopyrightEmailAncestorEdges(transaction, intakeId)
      const linked = await insertCopyrightEmailIntakeNoticeLink(transaction, {
        intakeId,
        noticeId: notice.noticeId,
        linkKind: 'thread',
      })
      await transaction.commit()
      return linked
    }
    const firstEdgeInserted = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    let holderProcessId: number | undefined
    const restore = afterPostgresTransactionQueryForTest(
      'recordCopyrightEmailAncestorEdges',
      values => values.includes(first.id),
      async transaction => {
        holderProcessId = await getTestPostgresBackendProcessId(transaction)
        firstEdgeInserted.resolve()
        await releaseFirst.promise
      },
    )
    onTestFinished(restore)
    const firstAttempt = link(first.id)
    void firstAttempt.catch(firstEdgeInserted.reject)
    let outcomes: PromiseSettledResult<boolean>[]
    try {
      await firstEdgeInserted.promise
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
          const secondAttempt = link(second.id)
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
    expect(outcomes).toEqual([
      { status: 'fulfilled', value: true },
      { status: 'fulfilled', value: true },
    ])
    for (const intakeId of [first.id, second.id]) {
      expect(await readCopyrightEmailAncestorIds(intakeId)).toEqual([parent.id])
      expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([
        { copyright_notice_id: notice.noticeId, link_kind: 'thread' },
      ])
    }
  })
})
