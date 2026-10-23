import { randomUUID } from 'node:crypto'
import { Worker } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '../data-stores/valkey-glide-mq/index.mts'
import { onGracefulShutdown } from '../data-stores/valkey-core/shutdown.mts'
import { BACKGROUND_QUEUE_NAME } from '../queues/background/config.mts'
import { background } from '../queues/background/queues.mts'
import {
  enqueueRecalculateUserVoteWeight,
  enqueueRecalculateVoteWeightEvents,
  enqueueVoteWeightDirtyMarkers,
} from '../queues/vote-aggregation/enqueues/vote-weight.mts'

export type ReplayScenario = 'event' | 'force' | 'continuation'
export type ReplayResult = {
  firstId: string
  replayId: string
  firstState: string | undefined
  replayState: string | undefined
  replayData: unknown
}

function singleJob(input: unknown): { id: string } {
  const job = Array.isArray(input) ? (input.length === 1 ? input[0] : null) : input
  if (!job || typeof job !== 'object' || typeof job.id !== 'string')
    throw new Error('Expected exactly one native vote-weight job')
  return job
}

async function run(scenario: ReplayScenario, userId: string): Promise<ReplayResult> {
  const worker = new Worker(BACKGROUND_QUEUE_NAME, async () => undefined, {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    blockTimeout: 1000,
    // Poll fixture priority work promptly; production scheduling defaults remain unchanged.
    promotionInterval: 1000,
  })
  try {
    await worker.waitUntilReady()
    const eventId = `voteWeight__${userId}__membershipExpired__${randomUUID()}`
    const afterId = `ffffffff-ffff-4fff-8fff-${randomUUID().slice(24)}`
    const enqueue =
      scenario === 'event'
        ? () =>
            enqueueRecalculateVoteWeightEvents([
              {
                userId,
                jobId: eventId,
              },
            ])
        : scenario === 'force'
          ? () => enqueueRecalculateUserVoteWeight(userId, true)
          : () => enqueueVoteWeightDirtyMarkers({ afterId })
    const first = await enqueueAndComplete(worker, enqueue)
    const firstState = await (await background.getJob(first.id))?.getState()
    const replay = await enqueueAndComplete(worker, enqueue)
    const persisted = await background.getJob(replay.id)
    return {
      firstId: first.id,
      replayId: replay.id,
      firstState,
      replayState: await persisted?.getState(),
      replayData: persisted?.data,
    }
  } finally {
    try {
      await worker.close()
    } finally {
      try {
        await background.obliterate({ force: true })
      } finally {
        await onGracefulShutdown()
      }
    }
  }
}

async function enqueueAndComplete(worker: Worker, enqueue: () => Promise<unknown>) {
  const completed = Promise.withResolvers<void>()
  const seen = new Set<string>()
  let expectedId: string | undefined
  const onCompleted = (job: { id: string }) => {
    seen.add(job.id)
    if (job.id === expectedId) completed.resolve()
  }
  const onFailed = (_job: unknown, error: Error) => completed.reject(error)
  worker.on('completed', onCompleted)
  worker.on('failed', onFailed)
  worker.on('error', completed.reject)
  try {
    const job = singleJob(await enqueue())
    expectedId = job.id
    if (seen.has(job.id)) completed.resolve()
    await completed.promise
    return job
  } finally {
    worker.off('completed', onCompleted)
    worker.off('failed', onFailed)
    worker.off('error', completed.reject)
  }
}

const scenario = process.argv[2] as ReplayScenario | undefined
const userId = process.argv[3]
const send = (message: object) =>
  new Promise<void>((resolve, reject) => {
    if (!process.send) return reject(new Error('Vote-weight child IPC is unavailable'))
    process.send(message, error => (error ? reject(error) : resolve()))
  })
try {
  if (!scenario || !['event', 'force', 'continuation'].includes(scenario) || !userId)
    throw new Error('Expected vote-weight replay scenario and user ID')
  await send({ type: 'result', result: await run(scenario, userId) })
} catch (err) {
  await send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
} finally {
  process.disconnect?.()
}
