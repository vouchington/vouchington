import { readCopyrightThreadDigestUsage } from '@voucha/test-helpers/copyright-thread-retention'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { readCopyrightCaseLifecycleClock } from '@voucha/test-helpers/copyright-lifecycle-clock'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { randomUUID } from 'node:crypto'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { describe, expect, it } from 'vitest'
import {
  seedCopyrightThreadRetirement,
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  createRetentionThreadSeedEmail,
  createRetentionParsedEmail,
} from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import {
  seedCopyrightStaffReceiptCorrespondence,
  seedCopyrightStaffReceiptDelivery,
  seedCopyrightStaffReceiptSent,
} from '@voucha/test-helpers/copyright-staff-receipt-delivery'
import { seedStatementTransportClaim } from '@voucha/test-helpers/copyright-statement-transport-fixtures'
import { readStatementTransportState } from '@voucha/test-helpers/copyright-statement-transport-state'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'

describe('copyright email thread ownership', () => {
  it('rejects fresh thread evidence after retirement without adding graph rows or legal activity', async () => {
    const notice = await createRetentionMinimalCase()
    const fresh = await createRetentionParsedEmail('fresh-after-retirement')
    await seedCopyrightThreadRetirement(
      notice.noticeId,
      getMinUUIDv7ForDate(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)),
    )
    const referencesBefore = await readCopyrightThreadReferenceState(fresh.id)
    const intakeBefore = await readCopyrightIntakeRetentionState(fresh.id)
    const clockBefore = await readCopyrightCaseLifecycleClock(notice.noticeId)
    await expect(
      linkCopyrightEmailIntakeToNotice({
        intakeId: fresh.id,
        noticeId: notice.noticeId,
        linkKind: 'thread',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'copyright_email_thread_changed' })
    expect(await readCopyrightEmailIntakeNoticeLinks(fresh.id)).toEqual([])
    expect(await readCopyrightThreadReferenceState(fresh.id)).toEqual(referencesBefore)
    expect(await readCopyrightIntakeRetentionState(fresh.id)).toEqual(intakeBefore)
    expect(await readCopyrightCaseLifecycleClock(notice.noticeId)).toEqual(clockBefore)
  })

  it('keeps nonempty duplicate reference and edge replay a no-op after retirement', async () => {
    const notice = await createRetentionMinimalCase()
    const ancestorCase = await createRetentionMinimalCase()
    const ancestorMessage = `<ancestor-${randomUUID()}@example.test>`
    const messageId = `<reply-${randomUUID()}@example.test>`
    const ancestor = await createRetentionThreadSeedEmail('duplicate-ancestor', {
      messageId: ancestorMessage,
    })
    const reply = await createRetentionThreadSeedEmail('duplicate-reply', {
      messageId,
      replyReferences: [ancestorMessage],
    })
    await linkTestCopyrightEmailIntake(ancestor.id, ancestorCase.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, notice.noticeId)
    const input = { intakeId: reply.id, messageId, inReplyTo: [ancestorMessage], references: [] }
    await recordCopyrightEmailThreadReferences(input)
    await seedCopyrightThreadRetirement(notice.noticeId, reply.id)
    const referencesBefore = await readCopyrightThreadReferenceState(reply.id)
    const intakeBefore = await readCopyrightIntakeRetentionState(reply.id)
    const linksBefore = await readCopyrightEmailIntakeNoticeLinks(reply.id)
    await expect(recordCopyrightEmailThreadReferences(input)).resolves.toBeNull()
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(referencesBefore)
    expect(await readCopyrightIntakeRetentionState(reply.id)).toEqual(intakeBefore)
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual(linksBefore)
    const freshInput = { ...input, messageId: `<fresh-${randomUUID()}@example.test>` }
    await expect(recordCopyrightEmailThreadReferences(freshInput)).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
    })
    const freshDigest = buildCopyrightEmailThreadReferenceRows(freshInput).find(
      row => row.reference_kind === 'message_id',
    )!.lookup_digest
    expect(await readCopyrightThreadDigestUsage(freshDigest)).toEqual({
      references: 0,
      matched_links: 0,
    })
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(referencesBefore)
    expect(await readCopyrightIntakeRetentionState(reply.id)).toEqual(intakeBefore)
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual(linksBefore)
  })

  it('keeps an existing case link when a later outbound reference names another case', async () => {
    const source = await createRetentionMinimalCase()
    const owner = await createRetentionMinimalCase()
    const correspondence = await seedCopyrightStaffReceiptCorrespondence({
      noticeId: source.noticeId,
      submissionId: null,
      correspondenceKind: 'status_update',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `body-${randomUUID()}`,
      draftedById: null,
    })
    const intent = await seedCopyrightStaffReceiptDelivery({
      noticeId: source.noticeId,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'status_update',
      channel: 'email',
      idempotencyKey: `thread-owner-${randomUUID()}`,
      recipientEmail: `claimant-${randomUUID()}@example.test`,
    })
    const leaseToken = await seedStatementTransportClaim(intent.id)
    const claim = (await readStatementTransportState(intent.id)).state.work
    expect(claim?.state).toBe('claimed')
    const outboundMessageId = `ses-owner-${randomUUID()}`
    expect(
      await seedCopyrightStaffReceiptSent({
        intentId: intent.id,
        leaseToken,
        sesMessageId: outboundMessageId,
      }),
    ).toBe(true)

    const reply = await createRetentionThreadSeedEmail('existing-owner', {
      sesMessageId: owner.initialEmailSesMessageId,
      messageId: `<${randomUUID()}@example.test>`,
    })
    await linkTestCopyrightEmailIntake(reply.id, owner.noticeId)
    const beforeReferences = await readCopyrightThreadReferenceState(reply.id)
    const beforeAncestry = (await readCopyrightIntakeRetentionState(reply.id)).ancestorCount
    const input = {
      intakeId: reply.id,
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [`<${outboundMessageId}>`],
      references: [],
    }
    const [attempt] = await Promise.allSettled([recordCopyrightEmailThreadReferences(input)])
    const rejection =
      attempt.status === 'rejected' && attempt.reason instanceof Error
        ? (attempt.reason as Error & { status?: number; code?: string; cause?: { code?: string } })
        : null
    const actual = {
      status: attempt.status,
      value: attempt.status === 'fulfilled' ? attempt.value : null,
      error: rejection
        ? { status: rejection.status, code: rejection.code, causeCode: rejection.cause?.code }
        : null,
      links: await readCopyrightEmailIntakeNoticeLinks(reply.id),
      ancestorCount: (await readCopyrightIntakeRetentionState(reply.id)).ancestorCount,
      referenceCount: (await readCopyrightThreadReferenceState(reply.id)).referenceCount,
    }
    const unchangedLinks = [{ copyright_notice_id: owner.noticeId, link_kind: 'initial' }]
    const completeReferenceCount =
      beforeReferences.referenceCount + buildCopyrightEmailThreadReferenceRows(input).length
    expect([
      {
        status: 'fulfilled',
        value: null,
        error: null,
        links: unchangedLinks,
        ancestorCount: beforeAncestry,
        referenceCount: completeReferenceCount,
      },
      {
        status: 'rejected',
        value: null,
        error: { status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED, causeCode: '40001' },
        links: unchangedLinks,
        ancestorCount: beforeAncestry,
        referenceCount: beforeReferences.referenceCount,
      },
      {
        status: 'rejected',
        value: null,
        error: { status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED, causeCode: '40P01' },
        links: unchangedLinks,
        ancestorCount: beforeAncestry,
        referenceCount: beforeReferences.referenceCount,
      },
      {
        status: 'rejected',
        value: null,
        error: { status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED, causeCode: '40001' },
        links: unchangedLinks,
        ancestorCount: beforeAncestry,
        referenceCount: completeReferenceCount,
      },
      {
        status: 'rejected',
        value: null,
        error: { status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED, causeCode: '40P01' },
        links: unchangedLinks,
        ancestorCount: beforeAncestry,
        referenceCount: completeReferenceCount,
      },
    ]).toContainEqual(actual)
  })
})
