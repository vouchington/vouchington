import { describe, expect, it } from 'vitest'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import {
  cleanUpSpendCapDay,
  rejectRegistryScriptsAfterRegistrationForTest,
  spendCapDelayableJob,
  uniqueSpendCapDay,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { normalizeSpendCapRegistration } from './spend-cap-delayed-job-registration.mts'
import {
  registerSpendCapDelayedJob,
  spendCapDelayedRegistryKey,
} from './spend-cap-delayed-jobs.mts'

describe('AI spend-cap delayed-job registration result handling', () => {
  it.each([undefined, [], [1, 'generation-a'], [1, 'generation-a', 0, 'extra']])(
    'rejects malformed registration result %j',
    result => {
      expect(() => normalizeSpendCapRegistration(result)).toThrow(
        'Invalid AI spend-cap registration result',
      )
    },
  )

  it('aborts the reservation when the job data write fails', async () => {
    const day = uniqueSpendCapDay()
    cleanUpSpendCapDay(day)
    const registrationError = new Error('job data update failed')
    const job = spendCapDelayableJob('report-judgement', {})
    job.updateData = () => Promise.reject(registrationError)

    await expect(registerSpendCapDelayedJob(job, day)).rejects.toBe(registrationError)

    await expect(
      workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${job.id}`),
    ).resolves.toBeNull()
  })

  it('preserves both failures when reservation abort cannot run', async () => {
    const day = uniqueSpendCapDay()
    cleanUpSpendCapDay(day)
    const registrationError = new Error('job data update failed')
    const abortError = new Error('abort script unavailable')
    rejectRegistryScriptsAfterRegistrationForTest(abortError)
    const job = spendCapDelayableJob('report-judgement', {})
    job.updateData = () => Promise.reject(registrationError)

    await expect(registerSpendCapDelayedJob(job, day)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError)
      expect((error as AggregateError).errors).toEqual([registrationError, abortError])
      expect((error as Error).cause).toBe(registrationError)
      return true
    })

    await expect(
      workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${job.id}`),
    ).resolves.toBe('registering')
  })
})
