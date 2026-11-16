import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createOutboundCopyrightCorrespondence } from './correspondence.mts'
import {
  claimCopyrightDeliveryIntent,
  createCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentSent,
} from './delivery-intents.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'

describe('copyright email thread ownership', () => {
  it('keeps committed parse references and the existing case link on changed-header replay', async () => {
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

    const reply = await createUnparsedCopyrightEmailIntake(
      new Date(),
      `ses-existing-owner-${randomUUID()}`,
    )
    const parse = {
      status: 'succeeded' as const,
      fromEmail: `claimant-${randomUUID()}@example.test`,
      subject: `Original message ${randomUUID()}`,
      bodyText: `Original body ${randomUUID()}`,
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [] as string[],
      replyReferences: [] as string[],
      autoSubmitted: 'auto-replied',
      attachments: [],
    }
    await expect(recordCopyrightEmailParse(reply, parse)).resolves.toBeNull()
    await linkTestCopyrightEmailIntake(reply.id, owner.noticeId)
    const beforeReferences = await readCopyrightThreadReferenceState(reply.id)
    const beforeAncestry = (await readCopyrightIntakeRetentionState(reply.id)).ancestorCount
    const changedHeaders = {
      ...parse,
      messageId: `<changed-${randomUUID()}@example.test>`,
      inReplyTo: [`<${outboundMessageId}>`],
    }
    const initialLink = [{ copyright_notice_id: owner.noticeId, link_kind: 'initial' }]

    expect(beforeReferences.referenceCount).toBe(1)
    expect(beforeAncestry).toBe(0)
    await expect(recordCopyrightEmailParse(reply, changedHeaders)).resolves.toBeNull()
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual(initialLink)
    expect(await readCopyrightIntakeRetentionState(reply.id)).toMatchObject({ ancestorCount: 0 })
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(beforeReferences)
  })
})
