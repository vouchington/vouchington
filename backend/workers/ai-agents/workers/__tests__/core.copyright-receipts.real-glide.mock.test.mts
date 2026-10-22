import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Queue, Worker, UnrecoverableError, type Job } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  workerQueueCommandClient,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { agentCallOperationKey } from '@agents/_shared'
import { spendCapConfig, spendCapDelayedRegistryKey } from '@services/ai-usage'
import {
  reserveAgentCallReceipt,
  getAgentCallReceipt,
} from '@services/ai-usage/agent-call-receipts'
import { createCopyrightAppeal, createCopyrightCounterNotice } from '@services/copyright-notices'
import { createTestUser } from '@voucha/test-helpers'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { ai_agents } from '@queues/ai-agents/queues'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'
import { processAIAgentWorkerJob } from '../core.mts'

const isolatedQueue = vi.hoisted(() => {
  const url = new URL(
    process.env.VALKEY_WORKER_QUEUE_URL || process.env.VALKEY_URL || 'redis://localhost:6379',
  )
  // GlideMQ encodes this number into its key prefix; it does not select a Valkey database.
  const identity = BigInt(`0x${crypto.randomUUID().replaceAll('-', '')}`).toString()
  url.pathname = identity
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
  return { prefix: `voucha_qdb_${identity}` }
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('copyright receipt recovery during a spend-cap breach', () => {
  afterAll(() => vi.unstubAllEnvs())
  it.each(['copyright-appeal-recommendation', 'copyright-submission-guidance'] as const)(
    'reaches terminal receipt review for %s instead of parking the reserved call',
    async agentSlug => {
      expect(workerQueuePrefix).toBe(isolatedQueue.prefix)
      const poster = await createTestUser()
      const { intake } = await createSignedInCopyrightForm(1, { poster })
      const noticeId = intake.copyright_notice_id
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      const targetId = aggregate?.targets[0]?.id
      if (!targetId) throw new Error('Expected copyright target')
      const filing =
        agentSlug === 'copyright-appeal-recommendation'
          ? await createCopyrightAppeal(poster, noticeId, randomUUID(), {
              reason: 'I created this image.',
              targetIds: [targetId],
            })
          : await createCopyrightCounterNotice(poster, noticeId, randomUUID(), {
              name: 'Test poster',
              address: '12 Example Street',
              telephone: '+1 555 010 0100',
              consentToFederalJurisdiction: true,
              consentToServiceOfProcess: true,
              goodFaithMisidentificationUnderPenaltyOfPerjury: true,
              electronicSignature: 'Test poster',
              targetIds: [targetId],
            })
      const submissionId = filing.submission.id
      const key = agentCallOperationKey(agentSlug, submissionId)
      const digest = '0'.repeat(64)
      await expect(reserveAgentCallReceipt(key, agentSlug, digest, submissionId)).resolves.toBe(
        true,
      )
      await spendCapConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, {
        enabled: true,
        daily_cap_microunits: 0,
      })
      const queueName = `copyright_receipt_cap_${randomUUID()}`
      const queue = new Queue<AIAgentJobData>(queueName, connection)
      const worker = new Worker<AIAgentJobData>(
        queueName,
        (job: Job<AIAgentJobData>) => processAIAgentWorkerJob(job),
        { ...connection, blockTimeout: 1_000 },
      )
      try {
        await worker.waitUntilReady()
        const failed = once(worker, 'failed')
        const added = await queue.add(agentSlug, { submission_id: submissionId }, { attempts: 3 })
        if (!added) throw new Error('Expected copyright worker job')
        const [job, error] = await waitForRealGlideEvent(
          failed,
          `GlideMQ copyright receipt ${submissionId}`,
        )
        expect(job.id).toBe(added.id)
        expect(error).toBeInstanceOf(UnrecoverableError)
        const stored = await queue.getJob(added.id)
        expect(await stored?.getState()).toBe('failed')
        expect(stored?.data).not.toHaveProperty('spendCapDelayedDay')
        await expect(getAgentCallReceipt(key)).resolves.toEqual({
          request_sha256: digest,
          result_ciphertext: null,
        })
      } finally {
        restore()
        await worker.close(true)
        await queue.obliterate({ force: true })
        await queue.close()
        await Promise.all([
          ai_agents.obliterate({ force: true }),
          backgroundCpu.obliterate({ force: true }),
        ])
        await workerQueueCommandClient.unlink([spendCapDelayedRegistryKey(getCurrentUtcDay())])
      }
    },
  )
})
