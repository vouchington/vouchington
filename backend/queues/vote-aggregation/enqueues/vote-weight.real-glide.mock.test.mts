import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Queue } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { ReplayResult, ReplayScenario } from '@voucha/test-helpers/vote-weight-replay-child'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { buildWorkerQueueSettings } from '../../../data-stores/valkey-core/glide-mq-client.mts'

// The dedicated project uses native GlideMQ; the child keeps its queue namespace private.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

async function runIsolatedReplay(scenario: ReplayScenario, userId: string): Promise<ReplayResult> {
  const url = new URL(process.env.VALKEY_WORKER_QUEUE_URL ?? process.env.VALKEY_URL!)
  // A numeric URL path maps to a unique GlideMQ key prefix on the same server, never SELECT/new DB.
  url.pathname = `/${BigInt(`0x${randomUUID().replaceAll('-', '')}`).toString()}`
  const isolatedQueueSettings = buildWorkerQueueSettings(url.toString())
  const child = fork(
    new URL('../../../test-helpers/vote-weight-replay-child.mts', import.meta.url),
    [scenario, userId],
    {
      env: { ...process.env, VALKEY_WORKER_QUEUE_URL: url.toString() },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    },
  )
  let result: ReplayResult | undefined
  let failure: Error | undefined
  child.on('message', message => {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      failure = new Error('Malformed vote-weight child receipt')
    } else if (message.type === 'error') {
      failure = new Error(String('message' in message ? message.message : 'Child failed'))
    } else if (message.type === 'result' && 'result' in message) {
      result = message.result as ReplayResult
    } else {
      failure = new Error('Unexpected vote-weight child receipt')
    }
  })
  child.on('error', error => {
    failure = error
  })
  const closed = new Promise<ReplayResult>((resolve, reject) => {
    child.once('close', (code, signal) => {
      if (failure) return reject(failure)
      if (code !== 0 || signal)
        return reject(new Error(`Vote-weight child exited (${code}, ${signal})`))
      if (!result) return reject(new Error('Vote-weight child exited without a result'))
      resolve(result)
    })
  })
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    const [childOutcome] = await Promise.allSettled([closed])
    // The parent owns cleanup even when SIGTERM prevents the child's finally block from running.
    const queue = new Queue(BACKGROUND_QUEUE_NAME, isolatedQueueSettings)
    let cleanupError: Error | undefined
    try {
      await queue.obliterate({ force: true })
    } catch (err) {
      cleanupError = err instanceof Error ? err : new Error('Queue removal failed', { cause: err })
    } finally {
      try {
        await queue.close()
      } catch (err) {
        const closeError =
          err instanceof Error ? err : new Error('Queue close failed', { cause: err })
        cleanupError = cleanupError
          ? new AggregateError([cleanupError, closeError], 'Isolated queue cleanup failed')
          : closeError
      }
    }
    if (!cleanupError) return
    if (childOutcome?.status === 'rejected')
      throw new AggregateError([childOutcome.reason, cleanupError], 'Child and cleanup failed', {
        cause: childOutcome.reason,
      })
    throw cleanupError
  })
  return closed
}

describe('vote-weight event replay through isolated real GlideMQ', () => {
  it('reactivates a retained completed event when an overlap reads it again', async () => {
    const userId = (await createTestUser()).id
    const result = await runIsolatedReplay('event', userId)
    expect(result.firstId).toMatch(new RegExp(`^voteWeight__${userId}__membershipExpired__`))
    expect(result.replayId).toBe(result.firstId)
    expect([result.firstState, result.replayState]).toEqual(['completed', 'completed'])
  })

  it('reactivates the stable force id for a later administrator recalculation', async () => {
    const userId = (await createTestUser()).id
    const result = await runIsolatedReplay('force', userId)
    expect(result.firstId).toBe(`voteWeight__${userId}__force`)
    expect(result.replayId).toBe(result.firstId)
    expect([result.firstState, result.replayState]).toEqual(['completed', 'completed'])
    expect(result.replayData).toMatchObject({ userId, forceRecalculate: true })
  })

  it('reactivates a finished dispatcher continuation with the same stable id', async () => {
    const userId = (await createTestUser()).id
    const result = await runIsolatedReplay('continuation', userId)
    expect(result.firstId).toMatch(/^voteWeightDispatch__dirty__/)
    expect(result.replayId).toBe(result.firstId)
    expect([result.firstState, result.replayState]).toEqual(['completed', 'completed'])
  })
})
