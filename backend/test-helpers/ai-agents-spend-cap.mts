import { randomUUID } from 'node:crypto'
import { DelayedError, type Job } from 'glide-mq'
import { onTestFinished, vi } from 'vitest'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { backgroundCpu } from '../queues/background-cpu/queues.mts'
import {
  beginSpendCapDelayedJobRelease,
  registerSpendCapDelayedJob,
  spendCapConfig,
  spendCapDelayedRegistryKey,
} from '../services/ai-usage/index.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'

/** A job whose `moveToDelayed` throws `DelayedError`, as glide-mq's does, and whose data persists. */
export function spendCapDelayableJob<T>(name: string, data: T): Job<T> {
  return {
    data,
    name,
    id: randomUUID(),
    reportTokens: vi.fn<(count: number) => Promise<void>>(),
    updateData: vi.fn<(nextData: T) => Promise<void>>().mockResolvedValue(undefined),
    moveToDelayed: vi
      .fn<(timestamp: number, nextStep?: string) => Promise<never>>()
      .mockImplementation(async timestamp => {
        throw new DelayedError(timestamp)
      }),
  } as unknown as Job<T>
}

/** Turns the daily spend cap off for the current test so unrelated worker tests ignore ambient usage. */
export function disableSpendCapForTest(): void {
  onTestFinished(overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false }))
}

/** The recheck coordinators queued for exactly this UTC day. */
export function findSpendCapRechecks(day: string) {
  return backgroundCpu.searchJobs({ name: 'ai-spend-cap.recheck', data: { day } })
}

/** Removes the registry hash and queued coordinators a test created for its own UTC `day`. */
export function cleanUpSpendCapDay(day: string): void {
  onTestFinished(async () => {
    const rechecks = await findSpendCapRechecks(day)
    await Promise.all(rechecks.map(recheck => recheck.remove()))
    await workerQueueCommandClient.unlink([spendCapDelayedRegistryKey(day)])
  })
}

/** A UTC day no other test or deployment uses, for registry tests that never evaluate the cap. */
export function uniqueSpendCapDay(): string {
  return `${3_000 + Math.floor(Math.random() * 6_000)}-08-16`
}

/** Registers one job and starts its release, so the day's registry is in `releasing` mode. */
export async function seedReleasingSpendCapRegistry(day: string): Promise<string> {
  const seed = spendCapDelayableJob('report-judgement', {})
  const registration = await registerSpendCapDelayedJob(seed, day)
  const lease = await beginSpendCapDelayedJobRelease(day, registration.generation)
  if (!lease) throw new Error('Expected the seeded spend-cap registry to begin releasing')
  return registration.generation
}
