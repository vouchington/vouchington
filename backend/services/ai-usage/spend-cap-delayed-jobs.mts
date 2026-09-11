import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import {
  registerWorkerQueueScript,
  workerQueueCommandClient,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { loadScript } from '@data-stores/valkey/scripts'
import {
  abortOpenAiSpendCapDelayedJobRegistration,
  normalizeOpenAiSpendCapRegistration,
  type OpenAiSpendCapRegistration,
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
type SpendCapDelayData = { openAiSpendCapDelayedDay?: string }
export function openAiSpendCapDelayedRegistryKey(day: string): string {
  return `${workerQueuePrefix ?? 'glide'}:{ai_agents}:openai-spend-cap-delayed:${day}`
}

export function registerOpenAiSpendCapDelayedJob<T extends SpendCapDelayData>(
  job: Job<T>,
  day: string,
  registry: RegistryClient = workerQueueCommandClient,
): Promise<OpenAiSpendCapRegistration> {
  return registerDelayedJob(job, day, false, registry)
}

export function registerOpenAiSpendCapDelayedJobAfterFreshBreach<T extends SpendCapDelayData>(
  job: Job<T>,
  day: string,
  registry: RegistryClient = workerQueueCommandClient,
): Promise<OpenAiSpendCapRegistration> {
  return registerDelayedJob(job, day, true, registry)
}

async function registerDelayedJob<T extends SpendCapDelayData>(
  job: Job<T>,
  day: string,
  reopenReleasing: boolean,
  registry: RegistryClient,
): Promise<OpenAiSpendCapRegistration> {
  const key = openAiSpendCapDelayedRegistryKey(day)
  const field = jobField(job.id)
  const accepted = await registry.invokeScript(registerDelayedJobScript, {
    keys: [key],
    args: [field, randomUUID(), String(REGISTER_TTL_MS), reopenReleasing ? '1' : '0'],
  })
  const registration = normalizeOpenAiSpendCapRegistration(accepted)
  if (!registration.accepted || registration.alreadyMarked) return registration

  try {
    await job.updateData({ ...job.data, openAiSpendCapDelayedDay: day })
    await registry.hset(key, { [field]: MARKED })
  } catch (error) {
    await abortOpenAiSpendCapDelayedJobRegistration(
      key,
      field,
      registration.generation,
      registry,
      error,
    )
  }
  return registration
}

export async function reopenOpenAiSpendCapDelayedJobRegistration(
  day: string,
  generation: string,
  registry: RegistryClient = workerQueueCommandClient,
): Promise<boolean> {
  const reopened = await registry.invokeScript(reopenRegistrationScript, {
    keys: [openAiSpendCapDelayedRegistryKey(day)],
    args: [generation],
  })
  return Number(reopened) === 1
}

function jobField(jobId: string): string {
  return `job:${jobId}`
}
