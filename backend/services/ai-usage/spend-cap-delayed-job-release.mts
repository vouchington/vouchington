import { randomUUID } from 'node:crypto'
import type { Queue } from 'glide-mq'
import {
  registerWorkerQueueScript,
  workerQueueCommandClient,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { loadScript } from '@data-stores/valkey/scripts'
import { openAiSpendCapDelayedRegistryKey } from './spend-cap-delayed-jobs.mts'
import pMap from 'p-map'

const RELEASE_BATCH_SIZE = 100
const RELEASE_CONCURRENCY = 5
const METADATA_FIELDS = new Set(['__mode', '__generation', '__release_lease'])
const MARKED = 'marked'
const REGISTERING = 'registering'
const beginReleaseScript = registerWorkerQueueScript(
  loadScript('begin-spend-cap-release.lua', import.meta.url),
)
const promotePageScript = registerWorkerQueueScript(
  loadScript('promote-spend-cap-release-page.lua', import.meta.url),
)
const deleteEntryScript = registerWorkerQueueScript(
  loadScript('delete-spend-cap-release-entry.lua', import.meta.url),
)
const completeReleaseScript = registerWorkerQueueScript(
  loadScript('complete-spend-cap-release.lua', import.meta.url),
)

type RegistryClient = Pick<typeof workerQueueCommandClient, 'hlen' | 'hscan' | 'invokeScript'>
type SpendCapDelayData = { openAiSpendCapDelayedDay?: string }
type AgentQueue = Pick<Queue<SpendCapDelayData>, 'getJob' | 'name'>
type ReleaseAction =
  | { kind: 'delete'; field: string; phase: string }
  | { kind: 'promote'; field: string; jobId: string }
  | undefined
export type OpenAiSpendCapReleaseResult = {
  released: number
  hasPending: boolean
  cursor: string
}

export async function beginOpenAiSpendCapDelayedJobRelease(
  day: string,
  generation: string,
  registry: RegistryClient = workerQueueCommandClient,
): Promise<string | undefined> {
  const lease = randomUUID()
  const started = await registry.invokeScript(beginReleaseScript, {
    keys: [openAiSpendCapDelayedRegistryKey(day)],
    args: [generation, lease],
  })
  return Number(started) === 1 ? lease : undefined
}

export async function releaseOpenAiSpendCapDelayedJobs(
  day: string,
  lease: string,
  queue: AgentQueue,
  registry: RegistryClient = workerQueueCommandClient,
  cursor = '0',
  dayHasEnded = false,
): Promise<OpenAiSpendCapReleaseResult> {
  const key = openAiSpendCapDelayedRegistryKey(day)
  const [nextCursor, fields] = await registry.hscan(key, cursor, { count: RELEASE_BATCH_SIZE })
  const entries = registryEntries(fields)
  const actions = await pMap(
    entries,
    entry => classifyReleaseEntry(day, entry, queue, dayHasEnded),
    { concurrency: RELEASE_CONCURRENCY, stopOnError: false },
  )
  const promotions = actions.filter(
    (action): action is Extract<ReleaseAction, { kind: 'promote' }> => action?.kind === 'promote',
  )
  const deletions = actions.filter(
    (action): action is Extract<ReleaseAction, { kind: 'delete' }> => action?.kind === 'delete',
  )
  const [, released] = await Promise.all([
    pMap(deletions, action => deleteEntry(key, lease, action.field, action.phase, registry), {
      concurrency: RELEASE_CONCURRENCY,
      stopOnError: false,
    }),
    promotePage(key, lease, day, promotions, queue.name, registry),
  ])
  return { released, hasPending: (await registry.hlen(key)) > 3, cursor: nextCursor }
}

async function classifyReleaseEntry(
  day: string,
  [field, phase]: [string, string],
  queue: AgentQueue,
  dayHasEnded: boolean,
): Promise<ReleaseAction> {
  const job = await queue.getJob(field.slice('job:'.length))
  const state = job ? await job.getState() : undefined
  const inactiveNaturallyReleased = state === 'waiting' || state === 'prioritized'
  const naturallyReleased = inactiveNaturallyReleased || state === 'active'
  if (!job || state === 'completed' || state === 'failed') {
    return { kind: 'delete', field, phase }
  } else if (job.data.openAiSpendCapDelayedDay === day && state === 'delayed') {
    return { kind: 'promote', field, jobId: job.id }
  } else if (
    (phase === MARKED &&
      (job.data.openAiSpendCapDelayedDay !== day || (dayHasEnded && naturallyReleased))) ||
    (phase === REGISTERING && dayHasEnded && inactiveNaturallyReleased)
  ) {
    return { kind: 'delete', field, phase }
  }
  return undefined
}

export async function completeOpenAiSpendCapDelayedJobRelease(
  day: string,
  generation: string,
  lease: string,
  registry: RegistryClient = workerQueueCommandClient,
): Promise<boolean> {
  const completed = await registry.invokeScript(completeReleaseScript, {
    keys: [openAiSpendCapDelayedRegistryKey(day)],
    args: [generation, lease],
  })
  return Number(completed) === 1
}

async function promotePage(
  key: string,
  lease: string,
  day: string,
  entries: { field: string; jobId: string }[],
  queueName: string,
  registry: RegistryClient,
): Promise<number> {
  if (entries.length === 0) return 0
  const queueKey = `${workerQueuePrefix ?? 'glide'}:{${queueName}}`
  const promoted = await registry.invokeScript(promotePageScript, {
    keys: [
      key,
      `${queueKey}:stream`,
      `${queueKey}:scheduled`,
      `${queueKey}:events`,
      `${queueKey}:lifo`,
      ...entries.map(({ jobId }) => `${queueKey}:job:${jobId}`),
    ],
    args: [lease, day, ...entries.flatMap(({ field, jobId }) => [field, jobId])],
  })
  return Number(promoted)
}

async function deleteEntry(
  key: string,
  lease: string,
  field: string,
  phase: string,
  registry: RegistryClient,
): Promise<void> {
  await registry.invokeScript(deleteEntryScript, {
    keys: [key],
    args: [lease, field, phase],
  })
}

function registryEntries(fields: unknown[]): [string, string][] {
  const entries: [string, string][] = []
  for (let index = 0; index < fields.length; index += 2) {
    const field = String(fields[index])
    if (!METADATA_FIELDS.has(field)) entries.push([field, String(fields[index + 1])])
  }
  return entries
}
