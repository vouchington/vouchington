import { associateCopyrightEmailIntakeWithNotice } from './email-manual-association.mts'
import { readCopyrightEmailManualAssociationEvent } from '@voucha/test-helpers/copyright-email-manual-association'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@voucha/test-helpers'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { holdCopyrightEmailReceiptShareForReplayTest } from '@voucha/test-helpers/copyright-operational-email-retention'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { describe, expect, it, onTestFinished } from 'vitest'
import { insertCopyrightEmailIntakeNoticeLink } from './email-thread-link.mts'

describe('copyright email notice link write order', () => {
  it('maps only the erased-case trigger conflict to the thread domain error', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionParsedEmail(`link-erasure-${randomUUID()}`)
    const erasedCaseFailure = Object.assign(
      new Error('erased copyright case cannot acquire an email intake'),
      { code: '23514' },
    )
    await using transaction = await beginTransaction()
    const rejected = rejectQuery(
      transaction,
      (statement, values) =>
        statement.includes('/* linkCopyrightEmailIntakeToNotice */') && values.includes(intake.id),
      erasedCaseFailure,
    )
    await expect(
      insertCopyrightEmailIntakeNoticeLink(rejected, {
        intakeId: intake.id,
        noticeId: notice.noticeId,
        linkKind: 'thread',
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      cause: erasedCaseFailure,
    })
    const unrelatedFailure = Object.assign(new Error('unrelated case check'), { code: '23514' })
    await expect(
      insertCopyrightEmailIntakeNoticeLink(
        rejectQuery(
          transaction,
          (statement, values) =>
            statement.includes('/* linkCopyrightEmailIntakeToNotice */') &&
            values.includes(intake.id),
          unrelatedFailure,
        ),
        { intakeId: intake.id, noticeId: notice.noticeId, linkKind: 'thread' },
      ),
    ).rejects.toBe(unrelatedFailure)
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
  })

  it('commits two distinct thread links after both have read the same live notice', async () => {
    const notice = await createRetentionMinimalCase()
    const first = await createRetentionParsedEmail(`link-first-${randomUUID()}`)
    const second = await createRetentionParsedEmail(`link-second-${randomUUID()}`)
    const bothPrechecked = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    onTestFinished(() => {
      bothPrechecked.reject(new Error('Owned thread-link preflight was not observed'))
      release.resolve()
    })
    let prechecked = 0
    const link = async (intakeId: string) => {
      await using transaction = await beginTransaction()
      const linked = await insertCopyrightEmailIntakeNoticeLink(transaction, {
        intakeId,
        noticeId: notice.noticeId,
        linkKind: 'thread',
      })
      await transaction.commit()
      return linked
    }
    const { result: outcomes, queries } = await observeTestPostgresClientQueries(
      async () => {
        const firstAttempt = link(first.id)
        const secondAttempt = link(second.id)
        void firstAttempt.catch(bothPrechecked.reject)
        void secondAttempt.catch(bothPrechecked.reject)
        try {
          await bothPrechecked.promise
          release.resolve()
          return await Promise.allSettled([firstAttempt, secondAttempt])
        } finally {
          release.resolve()
          await Promise.allSettled([firstAttempt, secondAttempt])
        }
      },
      async query => {
        if (
          !query.text.includes('/* readCopyrightThreadRetirement */') ||
          !query.values.some(value => Array.isArray(value) && value.includes(notice.noticeId))
        )
          return
        prechecked += 1
        if (prechecked === 2) bothPrechecked.resolve()
        await release.promise
      },
    )
    expect(prechecked).toBe(2)
    expect(
      queries.filter(
        query =>
          query.text.includes('/* readCopyrightThreadRetirement */') &&
          query.values.some(value => Array.isArray(value) && value.includes(notice.noticeId)),
      ),
    ).toHaveLength(2)
    expect(outcomes).toEqual([
      { status: 'fulfilled', value: true },
      { status: 'fulfilled', value: true },
    ])
    for (const intakeId of [first.id, second.id])
      expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([
        { copyright_notice_id: notice.noticeId, link_kind: 'thread' },
      ])
  })

  it('replays one thread link after both transactions acquire the receipt source guard', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionParsedEmail(`same-intake-link-${randomUUID()}`, {
      reply: true,
    })
    const bothHolding = Promise.withResolvers<void>()
    let held = 0
    const link = async () => {
      await using transaction = await beginTransaction()
      await holdCopyrightEmailReceiptShareForReplayTest(transaction, intake.id)
      held += 1
      if (held === 2) bothHolding.resolve()
      await bothHolding.promise
      const linked = await insertCopyrightEmailIntakeNoticeLink(transaction, {
        intakeId: intake.id,
        noticeId: notice.noticeId,
        linkKind: 'thread',
      })
      await transaction.commit()
      return linked
    }
    const first = link()
    const second = link()
    void first.catch(bothHolding.reject)
    void second.catch(bothHolding.reject)
    const outcomes = await Promise.allSettled([first, second])
    expect(held).toBe(2)
    expect(outcomes).toEqual([
      { status: 'fulfilled', value: true },
      { status: 'fulfilled', value: true },
    ])
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: notice.noticeId, link_kind: 'thread' },
    ])
  })
  it('keeps a conflicting retained pair and preserves the manual domain guard', async () => {
    const first = await createRetentionMinimalCase()
    const other = await createRetentionMinimalCase()
    const intake = await createRetentionParsedEmail(`retained-link-${randomUUID()}`, {
      reply: true,
    })
    await using transaction = await beginTransaction()
    expect(
      await insertCopyrightEmailIntakeNoticeLink(transaction, {
        intakeId: intake.id,
        noticeId: first.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(true)
    await transaction.commit()
    const before = await getCopyrightNoticePrivateAggregate(other.noticeId)
    await using replay = await beginTransaction()
    expect(
      await insertCopyrightEmailIntakeNoticeLink(replay, {
        intakeId: intake.id,
        noticeId: other.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(false)
    await replay.commit()
    await expect(
      associateCopyrightEmailIntakeWithNotice(other.moderator, intake.id, other.noticeId),
    ).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      cause: undefined,
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: first.noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([])
    expect(await getCopyrightNoticePrivateAggregate(other.noticeId)).toEqual(before)
  })
})
