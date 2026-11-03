import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { DelayedError } from 'glide-mq'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { ai_agents } from '@queues/ai-agents/queues'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { AIAgentJobData, SpendCapRecheckJobData } from '@queues/ai-agents/types'
import { registerSpendCapDelayedJob, spendCapDelayedRegistryKey } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import {
  cleanUpSpendCapDay,
  disableSpendCapForTest,
  reportRegistryScanCursorForTest,
  spendCapDelayableJob,
  uniqueSpendCapDay,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { delayForSpendCap } from '../processors/spend-cap-delay.mts'
import { processSpendCapRecheckJob } from '../processors/spend-cap-recheck.mts'

function aiAgentJob() {
  return spendCapDelayableJob('report-judgement', {} as AIAgentJobData)
}

function recheckJob(day: string, generation: string) {
  return spendCapDelayableJob<SpendCapRecheckJobData>('ai-spend-cap.recheck', { day, generation })
}

async function registryFields(day: string) {
  const key = spendCapDelayedRegistryKey(day)
  return {
    mode: await workerQueueCommandClient.hget(key, '__mode'),
    lease: await workerQueueCommandClient.hget(key, '__release_lease'),
  }
}

describe('AI spend-cap coordinated rechecks', () => {
  it('keeps a registered breach accepted when its coordinator enqueue rejects', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const failure = new Error('coordinator unavailable')
      const add = vi.spyOn(backgroundCpu, 'add').mockRejectedValue(failure)
      onTestFinished(() => add.mockRestore())
      const job = aiAgentJob()

      await expect(delayForSpendCap(job, day)).rejects.toThrow(DelayedError)

      const generation = await workerQueueCommandClient.hget(
        spendCapDelayedRegistryKey(day),
        '__generation',
      )
      expect(typeof generation).toBe('string')
      expect(add).toHaveBeenCalledExactlyOnceWith(
        'ai-spend-cap.recheck',
        { day, generation },
        expect.objectContaining({
          delay: 60_000,
          deduplication: { id: `ai-spend-cap:recheck:${day}:${generation}`, mode: 'simple' },
        }),
      )
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(failure, expect.anything())
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      await expect(
        workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${job.id}`),
      ).resolves.toBe('marked')
    })
  })

  it.each([
    ['rejects asynchronously', false],
    ['throws synchronously', true],
  ])('reports when registration %s and still parks the source job at midnight', async (_, sync) => {
    const day = uniqueSpendCapDay()
    const registrationError = new Error('registration unavailable')
    const job = aiAgentJob()
    if (sync) {
      vi.mocked(job.updateData).mockImplementation(() => {
        throw registrationError
      })
    } else {
      vi.mocked(job.updateData).mockRejectedValue(registrationError)
    }

    await expect(delayForSpendCap(job, day)).rejects.toThrow(DelayedError)

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(registrationError, expect.anything())
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('re-delays only the dedicated coordinator while a breach persists', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const registration = await registerSpendCapDelayedJob(aiAgentJob(), day)
      const job = recheckJob(day, registration.generation)

      await expect(processSpendCapRecheckJob(job)).rejects.toThrow(DelayedError)

      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 60_000)
      expect(job.data.generation).toBe(registration.generation)
      await expect(registryFields(day)).resolves.toEqual({ mode: 'collecting', lease: null })
    })
  })

  it('stops when a persisted release lease cannot be acquired', async () => {
    const day = uniqueSpendCapDay()
    cleanUpSpendCapDay(day)
    await disableSpendCapForTest()
    const seed = aiAgentJob()
    await registerSpendCapDelayedJob(seed, day)
    const job = recheckJob(day, 'a-generation-the-registry-never-issued')

    await expect(processSpendCapRecheckJob(job)).resolves.toBeUndefined()

    await expect(registryFields(day)).resolves.toEqual({ mode: 'collecting', lease: null })
    await expect(
      workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${seed.id}`),
    ).resolves.toBe('marked')
  })

  it('keeps draining bounded pages from the stored cursor until no registered jobs remain', async () => {
    const day = uniqueSpendCapDay()
    cleanUpSpendCapDay(day)
    await disableSpendCapForTest()
    // A job already waiting before the day ends stays registered, so the drain must continue.
    const waiting = await ai_agents.add('report-judgement', {
      spendCapDelayedDay: day,
    } as AIAgentJobData)
    if (!waiting) throw new Error('Expected the waiting spend-cap job')
    onTestFinished(() => waiting.remove())
    const registration = await registerSpendCapDelayedJob(waiting, day)
    const hscan = reportRegistryScanCursorForTest('42')
    const registryKey = spendCapDelayedRegistryKey(day)

    const first = recheckJob(day, registration.generation)
    await expect(processSpendCapRecheckJob(first)).rejects.toThrow(DelayedError)

    expect(hscan).toHaveBeenCalledExactlyOnceWith(registryKey, '0', { count: 100 })
    expect(first.updateData).toHaveBeenCalledExactlyOnceWith({
      day,
      generation: registration.generation,
      cursor: '42',
    })
    await expect(registryFields(day)).resolves.toMatchObject({ mode: 'releasing' })

    // The re-delayed coordinator resumes from the cursor it stored, not from the start.
    hscan.mockClear()
    const resumed = recheckJob(day, registration.generation)
    resumed.data.cursor = '42'
    await expect(processSpendCapRecheckJob(resumed)).rejects.toThrow(DelayedError)
    expect(hscan).toHaveBeenCalledExactlyOnceWith(registryKey, '42', { count: 100 })
  })

  it('completes after atomically closing an empty releasing registry', async () => {
    const day = uniqueSpendCapDay()
    cleanUpSpendCapDay(day)
    await disableSpendCapForTest()
    const registration = await registerSpendCapDelayedJob(aiAgentJob(), day)
    const job = recheckJob(day, registration.generation)

    await expect(processSpendCapRecheckJob(job)).resolves.toBeUndefined()

    expect(job.moveToDelayed).not.toHaveBeenCalled()
    await expect(workerQueueCommandClient.hlen(spendCapDelayedRegistryKey(day))).resolves.toBe(0)
  })
})
