import { describe, expect, it } from 'vitest'
import {
  countSupportInboundEmailMessageIdRegistryRows,
  getTestSupportInboundEmailFollowUpReceipt,
  insertTestIncompleteSupportInboundEmailMessageId,
} from '@voucha/test-helpers/entities/support-messages'
import {
  clearTestSupportInboundEmbeddingMarker,
  completeTestSupportInboundCustomerSupportReceipt,
} from '@voucha/test-helpers/entities/support-inbound-email-receipts'
import { createInboundSupportEmailMessage } from './create-inbound-support-message.mts'
import {
  assertReceiptObjectKey,
  completedReceiptResult,
  isInboundSupportEmailComplete,
  type InboundReceipt,
} from './inbound-email-receipts.mts'
import { claimKeyedSupportAgentRun } from './agent-runs.mts'
import { finalizeKeyedSupportAgentRun } from './finalize-keyed-support-agent-run.mts'

function makeInboundReceipt(overrides: Partial<InboundReceipt> = {}): InboundReceipt {
  return {
    s3_object_key: 'incoming/ses-receipt',
    support_thread_id: 'thread-1',
    support_message_id: 'message-1',
    processed_at: new Date(),
    embedding_enqueued_at: new Date(),
    customer_support_enqueued_at: new Date(),
    customer_support_completed_at: null,
    ...overrides,
  }
}

describe('inbound email receipts', () => {
  it('reports a missing receipt as incomplete', async () => {
    await expect(isInboundSupportEmailComplete(`ses-missing-${crypto.randomUUID()}`)).resolves.toBe(
      false,
    )
  })

  it('rejects a receipt bound to a different S3 object', () => {
    expect(() =>
      assertReceiptObjectKey(makeInboundReceipt(), 'ses-receipt', 'incoming/different-object'),
    ).toThrow('SES receipt ses-receipt is already bound to another S3 object')
  })

  it('rejects a processed receipt missing its support message', () => {
    expect(() => completedReceiptResult(makeInboundReceipt({ support_message_id: null }))).toThrow(
      'Processed SES receipt is missing its support message',
    )
  })

  it('rejects an incomplete inbound Message-ID reservation', async () => {
    const suffix = crypto.randomUUID()
    const emailMessageId = `<incomplete-${suffix}@voucha.ai>`
    await insertTestIncompleteSupportInboundEmailMessageId(emailMessageId)

    await expect(
      createInboundSupportEmailMessage({
        sesMessageId: `ses-incomplete-${suffix}`,
        s3ObjectKey: `incoming/ses-incomplete-${suffix}`,
        fromEmail: `tests+incomplete-${suffix}@voucha.ai`,
        subject: `Incomplete Message-ID ${suffix}`,
        bodyText: 'This reservation must not be reused before completion.',
        emailMessageId,
        emailTo: 'support@voucha.ai',
      }),
    ).rejects.toThrow(`Inbound email Message-ID reservation is incomplete: ${emailMessageId}`)
    await expect(countSupportInboundEmailMessageIdRegistryRows(emailMessageId)).resolves.toBe(1)
  })

  it('marks a duplicate Message-ID receipt when its keyed run already completed', async () => {
    const suffix = crypto.randomUUID()
    const emailMessageId = `<completed-duplicate-${suffix}@voucha.ai>`
    const firstSesMessageId = `ses-completed-original-${suffix}`
    const followUps = {
      enqueueEmbedding: async () => undefined,
      enqueueCustomerSupport: async () => undefined,
    }
    const first = await createInboundSupportEmailMessage(
      {
        sesMessageId: firstSesMessageId,
        s3ObjectKey: `incoming/${firstSesMessageId}`,
        fromEmail: `tests+completed-duplicate-${suffix}@voucha.ai`,
        subject: `Completed duplicate ${suffix}`,
        bodyText: 'Original delivery.',
        emailMessageId,
        emailTo: 'support@voucha.ai',
      },
      followUps,
    )
    if (!first.is_new) throw new Error('Expected the original delivery to create a message')
    const logicalJobId = `support_inbound_email__${first.message.id}__customer_support`
    const run = await claimKeyedSupportAgentRun({
      supportThreadId: first.threadId,
      supportMessageId: first.message.id,
      idempotencyKey: logicalJobId,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: { message_count: 1 },
    })
    if (!run?.claim_token) throw new Error('Expected a keyed support run')
    await finalizeKeyedSupportAgentRun({
      threadId: first.threadId,
      supportMessageId: first.message.id,
      agentRunId: run.id,
      claimToken: run.claim_token,
      responseText: null,
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    const duplicateSesMessageId = `ses-completed-duplicate-${suffix}`
    await expect(
      createInboundSupportEmailMessage(
        {
          sesMessageId: duplicateSesMessageId,
          s3ObjectKey: `incoming/${duplicateSesMessageId}`,
          fromEmail: `tests+completed-duplicate-${suffix}@voucha.ai`,
          subject: `Completed duplicate ${suffix}`,
          bodyText: 'Duplicate delivery.',
          emailMessageId,
          emailTo: 'support@voucha.ai',
        },
        followUps,
      ),
    ).resolves.toEqual({ is_new: false })
    expect(
      (await getTestSupportInboundEmailFollowUpReceipt(duplicateSesMessageId))
        ?.customer_support_completed_at,
    ).toBeInstanceOf(Date)
  })

  it('replays only a missing embedding leg for a duplicate Message-ID receipt', async () => {
    const suffix = crypto.randomUUID()
    const emailMessageId = `<partial-duplicate-${suffix}@voucha.ai>`
    const originalSesMessageId = `ses-partial-original-${suffix}`
    const duplicateSesMessageId = `ses-partial-duplicate-${suffix}`
    const embeddingJobIds: string[] = []
    const customerSupportJobIds: string[] = []
    const followUps = {
      async enqueueEmbedding(_: string, __: string, logicalJobId: string) {
        embeddingJobIds.push(logicalJobId)
      },
      async enqueueCustomerSupport(_: string, __: string, logicalJobId: string) {
        customerSupportJobIds.push(logicalJobId)
      },
    }
    const original = await createInboundSupportEmailMessage(
      {
        sesMessageId: originalSesMessageId,
        s3ObjectKey: `incoming/${originalSesMessageId}`,
        fromEmail: `tests+partial-duplicate-${suffix}@voucha.ai`,
        subject: `Partial duplicate ${suffix}`,
        bodyText: 'Original delivery.',
        emailMessageId,
        emailTo: 'support@voucha.ai',
      },
      followUps,
    )
    if (!original.is_new) throw new Error('Expected the original delivery to create a message')
    const originalEmbeddingJobId = embeddingJobIds[0]
    await clearTestSupportInboundEmbeddingMarker(originalSesMessageId)
    await completeTestSupportInboundCustomerSupportReceipt(originalSesMessageId)
    embeddingJobIds.length = 0
    customerSupportJobIds.length = 0

    await expect(
      createInboundSupportEmailMessage(
        {
          sesMessageId: duplicateSesMessageId,
          s3ObjectKey: `incoming/${duplicateSesMessageId}`,
          fromEmail: `tests+partial-duplicate-${suffix}@voucha.ai`,
          subject: `Partial duplicate ${suffix}`,
          bodyText: 'Duplicate delivery.',
          emailMessageId,
          emailTo: 'support@voucha.ai',
        },
        followUps,
      ),
    ).resolves.toEqual({ is_new: false })
    expect(embeddingJobIds).toHaveLength(1)
    expect(embeddingJobIds[0]).toBe(originalEmbeddingJobId)
    expect(customerSupportJobIds).toHaveLength(0)
    expect(await getTestSupportInboundEmailFollowUpReceipt(duplicateSesMessageId)).toEqual({
      embedding_enqueued_at: expect.any(Date),
      customer_support_enqueued_at: expect.any(Date),
      customer_support_completed_at: expect.any(Date),
    })
  })
})
