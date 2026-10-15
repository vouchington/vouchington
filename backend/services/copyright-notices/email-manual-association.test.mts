import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightNoticeForManualAssociation,
  insertCopyrightEmailManualAssociationEvent,
  markTestCopyrightNoticeErased,
  readCopyrightEmailManualAssociationEvent,
  readCopyrightEmailManualAssociationReview,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { lockTestCopyrightEmailIntakeForGraphChange } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { runWithCapturedQueries } from '../../data-stores/psql/query-capture.mts'
import { installSharedDbScopeObserver } from '../../../test-helpers/vitest-shared-db-scope-observer.mts'
import {
  associateCopyrightEmailIntakeWithNotice,
  getCopyrightNoticeAssociationTarget,
} from './email-manual-association.mts'
import { copyrightConfig } from './config.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'

async function createManualReply(): Promise<{ id: string }> {
  const reply = await recordThreadedCopyrightEmail({
    messageId: copyrightEmailMessageId(),
    replyReferences: [copyrightEmailMessageId()],
  })
  return { id: reply.intakeId }
}

describe('manual copyright email association', () => {
  it('does not strand a reply on a UK notice that cannot admit correspondence', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation(true, 'uk')

    expect(await getCopyrightNoticeAssociationTarget(moderator, noticeId)).toBeUndefined()
    await expect(
      associateCopyrightEmailIntakeWithNotice(moderator, intake.id, noticeId),
    ).rejects.toMatchObject({ status: 422 })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationReview(intake.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([])
  })

  it('does not strand a reply on an other-jurisdiction notice', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation(true, 'other')

    expect(await getCopyrightNoticeAssociationTarget(moderator, noticeId)).toBeUndefined()
    await expect(
      associateCopyrightEmailIntakeWithNotice(moderator, intake.id, noticeId),
    ).rejects.toMatchObject({ status: 422 })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationReview(intake.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([])
  })

  it('rejects an ordinary initial intake so its statutory case approval is not bypassed', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const initial = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [],
    })
    const noticeId = await createCopyrightNoticeForManualAssociation()

    await expect(
      associateCopyrightEmailIntakeWithNotice(moderator, initial.intakeId, noticeId),
    ).rejects.toMatchObject({ status: 409 })
    expect(await readCopyrightEmailIntakeNoticeLinks(initial.intakeId)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(initial.intakeId)).toEqual([])
  })

  it('does not attach an intake after a competing retention erasure commits', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await using erasure = await beginTransaction()
    await markTestCopyrightNoticeErased(noticeId, erasure)
    let resolvePreflight!: () => void
    const preflight = new Promise<void>(resolve => {
      resolvePreflight = resolve
    })
    const dispose = installSharedDbScopeObserver(event => {
      if (
        event.operation === 'associateCopyrightEmailIntakePreflight' &&
        event.scope.kind === 'ids' &&
        event.scope.ids[0] === intake.id
      )
        resolvePreflight()
    })
    try {
      const association = associateCopyrightEmailIntakeWithNotice(
        moderator,
        intake.id,
        noticeId,
      ).then(
        () => new Error('Erased case was linked'),
        err => err,
      )
      await preflight
      await erasure.commit()
      await expect(association).resolves.toMatchObject({ status: 404 })
    } finally {
      dispose()
    }
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([])
  })

  it('links one intake to an existing case and records actor, case, intake, and pending review', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()

    await expect(
      associateCopyrightEmailIntakeWithNotice(moderator, intake.id, noticeId),
    ).resolves.toEqual({
      copyright_notice: { id: noticeId },
      copyright_email_intake: { id: intake.id },
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailManualAssociationReview(intake.id)).toEqual([
      { copyright_notice_id: noticeId, action: 'pending' },
    ])
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([
      {
        copyright_notice_id: noticeId,
        changed_by_id: moderator.id,
        copyright_notice_email_intake_id: intake.id,
      },
    ])
  })

  it('requires the real link pair and a retained staff actor for the lifecycle event', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()

    await expect(
      insertCopyrightEmailManualAssociationEvent(noticeId, intake.id, moderator.id),
    ).rejects.toMatchObject({ code: '23503' })
    await associateCopyrightEmailIntakeWithNotice(moderator, intake.id, noticeId)
    await expect(
      insertCopyrightEmailManualAssociationEvent(noticeId, intake.id, null),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('returns 404 for a missing case without linking its owned intake', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const missingNoticeId = crypto.randomUUID()
    await expect(
      associateCopyrightEmailIntakeWithNotice(moderator, intake.id, missingNoticeId),
    ).rejects.toMatchObject({ status: 404 })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([])
  })

  it('returns the stable conflict when a thread link wins between preflight and intake lock', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await using threading = await beginTransaction()
    await lockTestCopyrightEmailIntakeForGraphChange(intake.id, threading)
    let resolvePreflight!: () => void
    const preflight = new Promise<void>(resolve => {
      resolvePreflight = resolve
    })
    let reviewsFromThreading: Awaited<
      ReturnType<typeof readCopyrightEmailManualAssociationReview>
    > = []
    const dispose = installSharedDbScopeObserver(event => {
      if (
        event.operation === 'associateCopyrightEmailIntakePreflight' &&
        event.scope.kind === 'ids' &&
        event.scope.ids[0] === intake.id
      )
        resolvePreflight()
    })
    try {
      const association = runWithCapturedQueries(async () =>
        associateCopyrightEmailIntakeWithNotice(moderator, intake.id, noticeId).then(
          () => new Error('Manual association unexpectedly won'),
          err => err,
        ),
      )
      await preflight
      expect(
        await linkCopyrightEmailIntakeToNotice(
          {
            intakeId: intake.id,
            noticeId,
            linkKind: 'thread',
          },
          threading,
        ),
      ).toBe(true)
      await threading.commit()
      reviewsFromThreading = await readCopyrightEmailManualAssociationReview(intake.id)
      const { result, queries } = await association
      expect(result).toMatchObject({ status: 409, code: 'copyright_email_thread_changed' })
      expect(
        queries.some(query =>
          query.text.includes('associateCopyrightEmailIntakeWithNotice:lockIntake'),
        ),
      ).toBe(true)
      expect(
        queries.filter(query =>
          query.text.includes('associateCopyrightEmailIntakeWithNotice:lockNotice'),
        ),
      ).toEqual([])
    } finally {
      dispose()
    }
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailManualAssociationReview(intake.id)).toEqual(reviewsFromThreading)
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([])
  })

  it('lets staff associate an unlinked reply after graph overflow, then use the existing review', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({ messageId, replyReferences: [] })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [messageId],
    })
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      emailThreadGraphMaxRows: 2,
    })
    let noticeId: string
    try {
      const promoted = await promoteCopyrightEmailIntake(
        await copyrightEmailPromotionInput(moderator, root.intakeId),
      )
      noticeId = promoted.noticeId
    } finally {
      restore()
    }
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])

    await associateCopyrightEmailIntakeWithNotice(moderator, reply.intakeId, noticeId)
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailManualAssociationReview(reply.intakeId)).toEqual([
      { copyright_notice_id: noticeId, action: 'pending' },
    ])
  })

  it('lets staff associate a reply whose referenced Message-ID has two owners', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    await recordThreadedCopyrightEmail({ messageId, replyReferences: [] })
    await recordThreadedCopyrightEmail({ messageId, replyReferences: [] })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [messageId],
    })
    const noticeId = await createCopyrightNoticeForManualAssociation()
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])

    await associateCopyrightEmailIntakeWithNotice(moderator, reply.intakeId, noticeId)
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailManualAssociationEvent(reply.intakeId)).toEqual([
      {
        copyright_notice_id: noticeId,
        changed_by_id: moderator.id,
        copyright_notice_email_intake_id: reply.intakeId,
      },
    ])
  })
})
