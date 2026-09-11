import { describe, expect, it } from 'vitest'
import { enqueueCustomerSupportAwaited } from '@queues/ai-agents/enqueues/customer-support'
import { enqueueEmbedSupportMessage } from '@queues/customer-support/enqueues'
import { getTestSupportInboundEmailFollowUpReceipt } from '@voucha/test-helpers/entities/support-messages'
import { createInboundSupportEmailMessage } from './create-inbound-support-message.mts'
import { getSupportAgentJobsFor, getSupportMessageEmbeddingJobsFor } from './queue-test-helpers.mts'

describe('createInboundSupportEmailMessage follow-up recovery', () => {
  it('retries only the missing follow-up after a partial enqueue failure', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const sesMessageId = `ses-inbound-partial-fanout-${suffix}`
    const params = {
      sesMessageId,
      s3ObjectKey: `incoming/${sesMessageId}`,
      fromEmail: `tests+inbound-partial-fanout-${suffix}@voucha.ai`,
      subject: `Inbound partial fan-out ${suffix}`,
      bodyText: 'Retry the missing follow-up only.',
      emailTo: 'support@voucha.ai',
    }
    const embeddingLogicalJobIds: string[] = []
    const customerSupportLogicalJobIds: string[] = []
    let persistedThreadId: string | undefined
    let persistedMessageId: string | undefined
    let failCustomerSupportEnqueue = true
    const followUpDependencies = {
      async enqueueEmbedding(threadId: string, messageId: string, logicalJobId: string) {
        persistedThreadId = threadId
        persistedMessageId = messageId
        embeddingLogicalJobIds.push(logicalJobId)
        await enqueueEmbedSupportMessage(threadId, messageId, undefined, logicalJobId)
      },
      async enqueueCustomerSupport(threadId: string, messageId: string, logicalJobId: string) {
        customerSupportLogicalJobIds.push(logicalJobId)
        if (failCustomerSupportEnqueue) {
          failCustomerSupportEnqueue = false
          throw new Error('simulated customer-support enqueue failure')
        }
        await enqueueCustomerSupportAwaited(threadId, {
          logicalJobId,
          supportMessageId: messageId,
        })
      },
    }

    await expect(createInboundSupportEmailMessage(params, followUpDependencies)).rejects.toThrow(
      'simulated customer-support enqueue failure',
    )

    const partialReceipt = await getTestSupportInboundEmailFollowUpReceipt(sesMessageId)
    expect(partialReceipt?.embedding_enqueued_at).toBeInstanceOf(Date)
    expect(partialReceipt?.customer_support_enqueued_at).toBeNull()
    expect(embeddingLogicalJobIds).toHaveLength(1)
    expect(customerSupportLogicalJobIds).toHaveLength(1)

    await expect(createInboundSupportEmailMessage(params, followUpDependencies)).resolves.toEqual({
      is_new: false,
    })

    const completedReceipt = await getTestSupportInboundEmailFollowUpReceipt(sesMessageId)
    expect(completedReceipt?.embedding_enqueued_at).toEqual(partialReceipt?.embedding_enqueued_at)
    expect(completedReceipt?.customer_support_enqueued_at).toBeInstanceOf(Date)
    expect(embeddingLogicalJobIds).toHaveLength(1)
    expect(customerSupportLogicalJobIds).toHaveLength(2)

    if (!persistedThreadId || !persistedMessageId) {
      throw new Error('Expected the embedding follow-up to receive persisted identifiers')
    }
    const embeddingJobs = await getSupportMessageEmbeddingJobsFor(
      persistedThreadId,
      persistedMessageId,
    )
    expect(embeddingJobs).toHaveLength(1)
    expect(embeddingJobs[0]?.id).toBe(embeddingLogicalJobIds[0])

    const customerSupportJobs = await getSupportAgentJobsFor(persistedThreadId)
    const customerSupportJob = customerSupportJobs.find(
      job => job.id === customerSupportLogicalJobIds[1],
    )
    expect(customerSupportJob?.data).toEqual({
      threadId: persistedThreadId,
      idempotencyKey: customerSupportLogicalJobIds[1],
      supportMessageId: persistedMessageId,
    })
    expect(customerSupportLogicalJobIds[1]).toBe(customerSupportLogicalJobIds[0])
  })
})
