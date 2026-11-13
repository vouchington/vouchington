import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { createCommittedCopyrightOverflowReply } from '@voucha/test-helpers/copyright-owned-email-replies'
import { assertOwnedCopyrightManualAssociation } from '@voucha/test-helpers/copyright-manual-association-outcome'
import { seedCopyrightAssociationInTransaction } from '@voucha/test-helpers/copyright-manual-association-prerequisite'
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
import { copyrightEmailMessageId } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import {
  eraseTestCopyrightEmailIntakeOriginal,
  markTestCopyrightEmailIntakeReceiptErased,
} from '@voucha/test-helpers/copyright-email-intake-retention'
import { associateCopyrightEmailIntakeWithNotice } from './email-manual-association.mts'
import { searchCopyrightNoticeAssociationTargets } from './association-search.mts'

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
    const initialRecord = await createRetentionParsedEmail('owned-initial-association', {
      messageId: copyrightEmailMessageId(),
    })
    const initial = { intakeId: initialRecord.id }
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

    expect.hasAssertions()
    await assertOwnedCopyrightManualAssociation(moderator, intake.id, noticeId)
  })

  it('requires the real link pair and a retained staff actor for the lifecycle event', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createManualReply()
    const noticeId = await createCopyrightNoticeForManualAssociation()

    await expect(
      insertCopyrightEmailManualAssociationEvent(noticeId, intake.id, moderator.id),
    ).rejects.toMatchObject({ code: '23503' })
    await seedCopyrightAssociationInTransaction(moderator, intake.id, noticeId)
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

  it.each(['thread', 'manual'] as const)(
    'preserves one link and its exact audit under %s-first overlap',
    async first => {
      const moderator = await createTestUser({ extraRoles: ['moderator'] })
      const intake = await createManualReply()
      const noticeId = await createCopyrightNoticeForManualAssociation()
      const result = await associateAndThreadCopyrightEmail(moderator, intake.id, noticeId, first)
      const link = { copyright_notice_id: noticeId, link_kind: 'thread' }
      const review = { copyright_notice_id: noticeId, action: 'pending' }
      const audit = {
        copyright_notice_id: noticeId,
        changed_by_id: moderator.id,
        copyright_notice_email_intake_id: intake.id,
      }
      const manualSuccess = {
        status: 'fulfilled',
        value: { copyright_notice: { id: noticeId }, copyright_email_intake: { id: intake.id } },
      }
      const threadSuccess = { status: 'fulfilled', value: true }
      const threadAbort = expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ code: '40001' }),
      })
      const manualAbort = expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: 'copyright_email_thread_changed',
          cause: expect.objectContaining({ code: '40001' }),
        }),
      })
      const manualGuard = expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: 'copyright_email_thread_changed',
          cause: undefined,
        }),
      })
      const state = {
        ...result,
        links: await readCopyrightEmailIntakeNoticeLinks(intake.id),
        reviews: await readCopyrightEmailManualAssociationReview(intake.id),
        audits: await readCopyrightEmailManualAssociationEvent(intake.id),
      }
      expect([
        {
          manual: manualSuccess,
          threaded: threadSuccess,
          links: [link],
          reviews: [review],
          audits: [audit],
        },
        {
          manual: manualSuccess,
          threaded: threadAbort,
          links: [link],
          reviews: [review],
          audits: [audit],
        },
        {
          manual: manualAbort,
          threaded: threadSuccess,
          links: [link],
          reviews: [review],
          audits: [],
        },
        {
          manual: manualGuard,
          threaded: threadSuccess,
          links: [link],
          reviews: [review],
          audits: [],
        },
        { manual: manualAbort, threaded: threadAbort, links: [], reviews: [], audits: [] },
      ]).toContainEqual(state)
    },
  )

  it('lets staff associate an unlinked reply after graph overflow, then use the existing review', async () => {
    expect.hasAssertions()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { noticeId, replyId } = await createCommittedCopyrightOverflowReply(moderator)
    expect(await readCopyrightEmailIntakeNoticeLinks(replyId)).toEqual([])
    await assertOwnedCopyrightManualAssociation(moderator, replyId, noticeId)
  })

  it('lets staff associate a reply whose referenced Message-ID has two owners', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    await createRetentionParsedEmail('duplicate-owner-one', { messageId })
    await createRetentionParsedEmail('duplicate-owner-two', { messageId })
    const replyRecord = await createRetentionParsedEmail('duplicate-owner-reply', {
      replyReferences: [messageId],
    })
    const reply = { intakeId: replyRecord.id }
    const noticeId = await createCopyrightNoticeForManualAssociation()
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([])

    await assertOwnedCopyrightManualAssociation(moderator, reply.intakeId, noticeId)
  })
})
