import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Queue } from 'glide-mq'
import { insertTestSupportContact } from '@voucha/test-helpers'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import type { CustomerSupportJobData } from '@queues/ai-agents/types'
import { enqueueOrRetryBulkCustomerSupport } from '@queues/ai-agents/enqueues/customer-support'
import {
  createSupportMessage,
  createSupportThread,
  getMemberSupportAgentJobId,
  reserveAutomaticSupportAgentIntent,
} from '@services/customer-support'
import { processReconcileMemberSupportAgentIntents } from './process-reconcile-member-support-agent-intents.mts'

// This verifies the actual Valkey/GlideMQ boundary; the passthrough is required by the dedicated
// backend-real-glide-mq project filename convention.
vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('processReconcileMemberSupportAgentIntents with real GlideMQ', () => {
  it('recovers a committed member draft intent through PostgreSQL and GlideMQ exactly once', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+member-draft-reconciliation-${suffix}@voucha.ai`,
    })
    const thread = await createSupportThread(contact.id, `Member draft recovery ${suffix}`, {
      skipEnqueue: true,
    })
    const message = await createSupportMessage(
      thread.id,
      { direction: 'inbound', bodyText: 'Please recover my draft.' },
      { skipEnqueue: true },
    )
    const logicalJobId = getMemberSupportAgentJobId(message.id)
    const queue = new Queue<CustomerSupportJobData>(
      `member_support_intent_recovery_${randomUUID()}`,
      { connection: workerQueueConnection, prefix: workerQueuePrefix },
    )
    await reserveAutomaticSupportAgentIntent(
      {
        supportThreadId: thread.id,
        supportMessageId: message.id,
        modelName: 'gpt-5.4-nano',
        modelProvider: 'openai',
        input: { thread_subject: thread.subject, message_count: 1 },
      },
      {},
    )

    try {
      const enqueueOrRetry = async (
        inputs: Parameters<typeof enqueueOrRetryBulkCustomerSupport>[0],
      ) =>
        await enqueueOrRetryBulkCustomerSupport(inputs, {
          enqueueBulk: async candidates =>
            await queue.addBulk(
              candidates.map(candidate => ({
                name: 'customer-support',
                data: {
                  threadId: candidate.threadId,
                  supportMessageId: candidate.supportMessageId,
                  idempotencyKey: candidate.logicalJobId,
                },
                opts: {
                  jobId: candidate.logicalJobId,
                  attempts: 3,
                  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
                  removeOnComplete: 100,
                  removeOnFail: 100,
                  priority: 5,
                  deduplication: { id: candidate.logicalJobId, mode: 'simple' as const },
                },
              })),
            ),
          getJob: async id => await queue.getJob(id, { excludeData: true }),
          getFailedJobs: async () => await queue.getJobs('failed', 0, -1, { excludeData: true }),
        })

      await processReconcileMemberSupportAgentIntents({
        enqueueOrRetryBulkCustomerSupport: enqueueOrRetry,
      })
      await processReconcileMemberSupportAgentIntents({
        enqueueOrRetryBulkCustomerSupport: enqueueOrRetry,
      })

      await expect(queue.getJob(logicalJobId)).resolves.toMatchObject({
        id: logicalJobId,
        name: 'customer-support',
        data: {
          threadId: thread.id,
          supportMessageId: message.id,
          idempotencyKey: logicalJobId,
        },
      })
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
