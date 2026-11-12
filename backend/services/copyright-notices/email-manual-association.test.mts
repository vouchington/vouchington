import { seedUnmatchedCopyrightEmailReply as createManualReply } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightNoticeForManualAssociation,
  insertCopyrightEmailManualAssociationEvent,
  markTestCopyrightNoticeErased,
  readCopyrightEmailManualAssociationEvent,
  readCopyrightEmailManualAssociationReview,
  associateAndThreadCopyrightEmail,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import {
  eraseTestCopyrightEmailIntakeOriginal,
  markTestCopyrightEmailIntakeReceiptErased,
} from '@voucha/test-helpers/copyright-email-intake-retention'
import { associateCopyrightEmailIntakeWithNotice } from './email-manual-association.mts'
import { searchCopyrightNoticeAssociationTargets } from './association-search.mts'
import { copyrightConfig } from './config.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'

describe('manual copyright email association', () => {
  it('does not strand a reply on a UK notice that cannot admit correspondence', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation(true, 'uk')

    expect(
      (await searchCopyrightNoticeAssociationTargets(moderator, 'Claimant')).copyright_notices.some(
        notice => notice.id === noticeId,
      ),
    ).toBe(false)
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

    expect(
      (await searchCopyrightNoticeAssociationTargets(moderator, 'Claimant')).copyright_notices.some(
        notice => notice.id === noticeId,
      ),
    ).toBe(false)
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

  it('does not attach an intake to an already erased case', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await using erasure = await beginTransaction()
    await markTestCopyrightNoticeErased(noticeId, erasure)
    await erasure.commit()
    await expect(
      associateCopyrightEmailIntakeWithNotice(moderator, intake.id, noticeId),
    ).rejects.toMatchObject({ status: 404 })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([])
  })

  it.each([
    ['original evidence', eraseTestCopyrightEmailIntakeOriginal],
    ['receipt', markTestCopyrightEmailIntakeReceiptErased],
  ] as const)('does not attach an intake after retention erased its %s', async (_kind, erase) => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await erase(intake.id)
    await expect(
      associateCopyrightEmailIntakeWithNotice(moderator, intake.id, noticeId),
    ).rejects.toMatchObject({ status: 404 })
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

  it('rejects staff association when the competing thread link commits first', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const result = await associateAndThreadCopyrightEmail(moderator, intake.id, noticeId, 'thread')
    expect(result).toMatchObject({
      threaded: true,
      manual: {
        status: 'rejected',
        reason: { status: 409, code: 'copyright_email_thread_changed' },
      },
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailManualAssociationReview(intake.id)).toEqual([
      { copyright_notice_id: noticeId, action: 'pending' },
    ])
    expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toEqual([])
  })

  it('retains one staff audit when manual association commits before the competing thread link', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const result = await associateAndThreadCopyrightEmail(moderator, intake.id, noticeId, 'manual')
    expect(result).toEqual({
      threaded: true,
      manual: {
        status: 'fulfilled',
        value: { copyright_notice: { id: noticeId }, copyright_email_intake: { id: intake.id } },
      },
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
