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
export async function disableSpendCapForTest(): Promise<void> {
  await spendCapConfig.waitForInitialization()
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

type CommandClientPrototype = {
  hscan: (this: unknown, ...args: unknown[]) => Promise<[unknown, unknown]>
  invokeScript: (...args: unknown[]) => Promise<unknown>
}

// The shared command client is a Proxy that resolves each command on the real client per call,
// so the real client's prototype is the one place a spy sees the commands it sends to Valkey.
function commandClientPrototype(): CommandClientPrototype {
  const clientClass = workerQueueCommandClient.constructor as unknown as {
    prototype: CommandClientPrototype
  }
  return clientClass.prototype
}

/** Runs the real `HSCAN` but reports `cursor` as the next cursor, so a resumed scan is observable. */
export function reportRegistryScanCursorForTest(cursor: string) {
  const prototype = commandClientPrototype()
  const realHscan = prototype.hscan
  const hscan = vi.spyOn(prototype, 'hscan').mockImplementation(async function (
    this: unknown,
    ...args: unknown[]
  ) {
    const [, fields] = await realHscan.apply(this, args)
    return [cursor, fields]
  })
  onTestFinished(() => {
    hscan.mockRestore()
  })
  return hscan
}

/** Makes every registry script reply "not accepted", as when a newer generation owns the day. */
export function rejectRegistryScriptsForTest() {
  const invokeScript = vi
    .spyOn(commandClientPrototype(), 'invokeScript')
    .mockResolvedValue([0, 'rejected-generation', 0])
  onTestFinished(() => {
    invokeScript.mockRestore()
  })
  return invokeScript
}

type RegistryScriptOptions = { keys?: unknown[]; args?: unknown[] } | undefined

/**
 * Runs the real registry scripts but reports each invocation's options first, so a test can read
 * the exact keys and args production sent, or change state between classification and promotion.
 */
export function interceptRegistryScriptsForTest(
  before: (options: RegistryScriptOptions) => Promise<void> | void,
) {
  const prototype = commandClientPrototype()
  const realInvokeScript = prototype.invokeScript
  const invokeScript = vi.spyOn(prototype, 'invokeScript').mockImplementation(async function (
    this: unknown,
    ...args: unknown[]
  ) {
    await before(args[1] as RegistryScriptOptions)
    return realInvokeScript.apply(this, args)
  })
  onTestFinished(() => {
    invokeScript.mockRestore()
  })
  return invokeScript
}
