import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionThreadSeedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { createOutboundCopyrightCorrespondence } from './correspondence.mts'
import {
  claimCopyrightDeliveryIntent,
  createCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentSent,
} from './delivery-intents.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'

describe('copyright email thread ownership', () => {
  it('keeps an existing case link when a later outbound reference names another case', async () => {
    const source = await createRetentionMinimalCase()
    const owner = await createRetentionMinimalCase()
    const correspondence = await createOutboundCopyrightCorrespondence({
      noticeId: source.noticeId,
      submissionId: null,
      correspondenceKind: 'status_update',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `body-${randomUUID()}`,
      draftedById: null,
    })
    const intent = await createCopyrightDeliveryIntent({
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
    const claim = await claimCopyrightDeliveryIntent(intent.id)
    expect(claim?.state).toBe('claimed')
    const outboundMessageId = `ses-owner-${randomUUID()}`
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId: intent.id,
        leaseToken: claim!.lease_token,
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
        ? (attempt.reason as Error & { status?: number; cause?: { code?: string } })
        : null
    const actual = {
      status: attempt.status,
      value: attempt.status === 'fulfilled' ? attempt.value : null,
      error: rejection ? { status: rejection.status, causeCode: rejection.cause?.code } : null,
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
        error: { status: 409, causeCode: '40001' },
        links: unchangedLinks,
        ancestorCount: beforeAncestry,
        referenceCount: beforeReferences.referenceCount,
      },
      {
        status: 'rejected',
        value: null,
        error: { status: 409, causeCode: '40001' },
        links: unchangedLinks,
        ancestorCount: beforeAncestry,
        referenceCount: completeReferenceCount,
      },
    ]).toContainEqual(actual)
  })
})
