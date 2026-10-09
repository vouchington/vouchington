import { describe, expect, it, vi } from 'vitest'
import {
  ENQUEUE_BASE_DEFAULTS,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { startRealGlideJobLifecycle } from '@voucha/test-helpers/real-glide-job-lifecycle'
import type { EmailJobs } from '../types.mts'
import { getEmailSendJobOptions } from './job-options.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

// A job that has finished must leave no copy of the credential it carried in Valkey.
describe('email send job retention through real GlideMQ', () => {
  // Zero priority skips the scheduler's ~5s promotion of prioritized jobs, and one attempt avoids
  // waiting out a retry backoff; neither affects what happens to the record at the end.
  const productionOptions = (jobName: EmailJobs) => ({
    ...ENQUEUE_BASE_DEFAULTS,
    ...getEmailSendJobOptions(jobName),
    attempts: 1,
    priority: 0,
  })

  it.each([
    ['processSendEmailAddressLoginToken', 'complete', 'completed'],
    ['processSendEmailAddressLoginToken', 'fail', 'failed'],
    ['processSendCommunityInviteEmail', 'fail', 'failed'],
  ] as const)(
    'leaves no record of a %s job after it %ss',
    async (jobName, outcome, terminalState) => {
      const lifecycle = await startRealGlideJobLifecycle<Record<string, unknown>>(
        'email_secret',
        connection,
      )
      try {
        lifecycle.setOutcome(outcome)
        const job = await lifecycle.queue.add(
          jobName,
          { input: { emailAddress: 'tests@voucha.ai' }, variables: { token: 'ABC123' } },
          productionOptions(jobName),
        )
        if (!job) throw new Error('Expected the email job to be created')

        await expect(lifecycle.settled(job)).resolves.toBe(terminalState)

        await expect(lifecycle.queue.getJob(job.id)).resolves.toBeNull()
        await expect(
          lifecycle.queue.searchJobs({ name: jobName, state: terminalState }),
        ).resolves.toEqual([])
      } finally {
        await lifecycle.close()
      }
    },
  )

  it('keeps the default retained history for an email that carries no credential', async () => {
    const lifecycle = await startRealGlideJobLifecycle<Record<string, unknown>>(
      'email_plain',
      connection,
    )
    try {
      const job = await lifecycle.queue.add(
        'processSendWelcomeEmail',
        { input: { userId: crypto.randomUUID() }, variables: { userName: 'Test User' } },
        productionOptions('processSendWelcomeEmail'),
      )
      if (!job) throw new Error('Expected the email job to be created')

      await expect(lifecycle.settled(job)).resolves.toBe('completed')

      await expect(lifecycle.queue.getJob(job.id)).resolves.not.toBeNull()
    } finally {
      await lifecycle.close()
    }
  })
})
