import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import {
  registerWorkerQueueScript,
  workerQueueCommandClient,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { loadScript } from '@data-stores/valkey/scripts'
import {
  abortSpendCapDelayedJobRegistration,
  normalizeSpendCapRegistration,
  type SpendCapRegistration,
} from './spend-cap-delayed-job-registration.mts'

const MARKED = 'marked'
const REGISTER_TTL_MS = 2 * 24 * 60 * 60 * 1000
const registerDelayedJobScript = registerWorkerQueueScript(
  loadScript('register-spend-cap-delayed-job.lua', import.meta.url),
)
const reopenRegistrationScript = registerWorkerQueueScript(
  loadScript('reopen-spend-cap-registration.lua', import.meta.url),
)

type RegistryClient = Pick<typeof workerQueueCommandClient, 'hset' | 'invokeScript'>
type SpendCapDelayData = { spendCapDelayedDay?: string }
export function spendCapDelayedRegistryKey(day: string): string {
  return `${workerQueuePrefix ?? 'glide'}:{ai_agents}:ai-spend-cap-delayed:${day}`
}

export function registerSpendCapDelayedJob<T extends SpendCapDelayData>(
  job: Job<T>,
  day: string,
  registry: RegistryClient = workerQueueCommandClient,
): Promise<SpendCapRegistration> {
  return registerDelayedJob(job, day, false, registry)
}

export function registerSpendCapDelayedJobAfterFreshBreach<T extends SpendCapDelayData>(
  job: Job<T>,
  day: string,
  registry: RegistryClient = workerQueueCommandClient,
): Promise<SpendCapRegistration> {
  return registerDelayedJob(job, day, true, registry)
}

async function registerDelayedJob<T extends SpendCapDelayData>(
  job: Job<T>,
  day: string,
  reopenReleasing: boolean,
  registry: RegistryClient,
): Promise<SpendCapRegistration> {
  const key = spendCapDelayedRegistryKey(day)
  const field = jobField(job.id)
  const accepted = await registry.invokeScript(registerDelayedJobScript, {
    keys: [key],
    args: [field, randomUUID(), String(REGISTER_TTL_MS), reopenReleasing ? '1' : '0'],
  })
  const registration = normalizeSpendCapRegistration(accepted)
  if (!registration.accepted || registration.alreadyMarked) return registration

  try {
    await job.updateData({ ...job.data, spendCapDelayedDay: day })
    await registry.hset(key, { [field]: MARKED })
  } catch (err) {
    await abortSpendCapDelayedJobRegistration(key, field, registration.generation, registry, err)
  }
  return registration
}

export async function reopenSpendCapDelayedJobRegistration(
  day: string,
  generation: string,
  registry: RegistryClient = workerQueueCommandClient,
): Promise<boolean> {
  const reopened = await registry.invokeScript(reopenRegistrationScript, {
    keys: [spendCapDelayedRegistryKey(day)],
    args: [generation],
  })
  return Number(reopened) === 1
}

function jobField(jobId: string): string {
  return `job:${jobId}`
}
