import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueueEvents } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import {
  extendCpuProviderCooldownMs,
  getCpuProviderCooldownRemainingMs,
} from '@services/bedrock-embeddings/provider-cooldown'
import type { BackgroundCpuHandler, BackgroundCpuJobDefinition } from '@queues/background-cpu/types'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import type { BackgroundCpuHarness } from '@voucha/test-helpers/real-glide-background-cpu'
import {
  acquireContentAnalysisTestReservation,
  waitForQueueDomainTestResult,
} from '@voucha/test-helpers/queue-domain-controls'
import { createBackgroundCpuProcessor } from '../processors.mts'
import { withBedrockRateLimit } from '../processors/bedrock-rate.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())
const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const single = requireBackgroundCpuJob('bedrock-embeddings.post')
const singleTopic = requireBackgroundCpuJob('bedrock-embeddings.topic')
const contentPost = requireBackgroundCpuJob('content-analysis.post')

describe('background-cpu groups through real GlideMQ', () => {
  let harness: BackgroundCpuHarness | undefined
  let events: QueueEvents | undefined
  let reservation: ReturnType<typeof acquireContentAnalysisTestReservation> | undefined
  let pendingWork: Promise<unknown> | undefined
  let cleanup: () => Promise<void>

  beforeEach(async context => {
    let closing: Promise<void> | undefined
    cleanup = () =>
      (closing ??= (async () => {
        await using closingResources = new AsyncDisposableStack()
        closingResources.defer(async () => {
          const lease = await reservation
          await lease?.release()
        })
        closingResources.defer(async () => {
          await harness?.close()
        })
        closingResources.defer(async () => {
          await events?.close()
        })
        await pendingWork?.catch(() => undefined)
      })())
    context.onTestFinished(cleanup)
    reservation = acquireContentAnalysisTestReservation('shared')
    await reservation
    context.signal.throwIfAborted()
  })
  afterEach(() => cleanup())

  function trackWork<T>(signal: AbortSignal, start: () => Promise<T>): Promise<T> {
    signal.throwIfAborted()
    const operation = start()
    pendingWork = operation
    return operation
  }

  it('cools the throttled Bedrock ordering group while another CPU domain keeps running', async ({
    signal,
  }) => {
    const startedBedrock: string[] = []
    const defaultOrdering = single.options.ordering
    if (!defaultOrdering) throw new Error('Expected Bedrock ordering lane')
    const ordering = {
      ...defaultOrdering,
      key: `bedrock-embeddings:single:${randomUUID()}`,
    }
    const throttle = Object.assign(new Error('Bedrock request throttled'), {
      name: 'ThrottlingException',
      $metadata: { httpStatusCode: 429 },
    })
    const handlers = new Map<string, BackgroundCpuHandler>([
      [
        single.name,
        {
          job: single,
          handle: job => {
            startedBedrock.push(job.id)
            if (startedBedrock.length === 1)
              return withBedrockRateLimit(async () => {
                throw throttle
              })
            return undefined
          },
        },
      ],
      [singleTopic.name, { job: singleTopic, handle: job => startedBedrock.push(job.id) }],
      [contentPost.name, { job: contentPost, handle: () => undefined }],
    ])
    const starting = trackWork(signal, () =>
      startRealGlideBackgroundLifecycle<BackgroundCpuJobDefinition>({
        queueNamePrefix: 'background_cpu_bedrock_cooldown',
        connection,
        processor: createBackgroundCpuProcessor(handlers),
      }),
    )
    harness = await starting
    signal.throwIfAborted()
    events = new QueueEvents(harness.queue.name, {
      ...connection,
      lastEventId: '0',
      blockTimeout: 1_000,
    })
    const delayedEvents: Array<{ jobId?: string }> = []
    const failedEvents: Array<{ jobId?: string; failedReason?: string }> = []
    events.on('delay-changed', event => delayedEvents.push(event))
    events.on('failed', event => failedEvents.push(event))
    await events.waitUntilReady()

    const limited = await trackWork(signal, () =>
      harness!.add(single, { id: randomUUID() }, { ordering }),
    )
    await waitForQueueDomainTestResult(harness.activated(limited, 1), signal)
    // With one worker, the other-domain completion proves the first job's 429 was processed.
    const firstUnrelatedCompleted = waitForQueueDomainTestResult(
      once(events, 'completed', { signal }),
      signal,
    )
    const firstUnrelated = await trackWork(signal, () =>
      harness!.add(contentPost, { id: randomUUID() }),
    )
    await expect(
      waitForQueueDomainTestResult(harness.settled(firstUnrelated), signal),
    ).resolves.toBe('completed')
    const [completionEvent] = await firstUnrelatedCompleted
    expect(completionEvent).toMatchObject({ jobId: firstUnrelated.id })
    const limitedAfterThrottle = await harness.queue.getJob(limited.id)
    expect(limitedAfterThrottle).toMatchObject({
      groupKey: ordering.key,
      attemptsMade: 0,
    })
    expect(await limitedAfterThrottle?.getState()).toBe('delayed')
    expect(delayedEvents).toContainEqual(expect.objectContaining({ jobId: limited.id }))
    expect(await getCpuProviderCooldownRemainingMs(ordering.key)).toBeGreaterThan(1_000)
    await trackWork(signal, () => extendCpuProviderCooldownMs(ordering.key, 1_000))
    expect(await getCpuProviderCooldownRemainingMs(ordering.key)).toBeGreaterThan(1_000)
    expect(failedEvents).toEqual([])

    const sameGroup = await trackWork(signal, () =>
      harness!.add(singleTopic, { id: randomUUID() }, { ordering }),
    )
    signal.throwIfAborted()
    const secondUnrelatedCompleted = waitForQueueDomainTestResult(
      once(events, 'completed', { signal }),
      signal,
    )
    const secondUnrelated = await trackWork(signal, () =>
      harness!.add(contentPost, { id: randomUUID() }),
    )
    await expect(
      waitForQueueDomainTestResult(harness.settled(secondUnrelated), signal),
    ).resolves.toBe('completed')
    const [secondCompletionEvent] = await secondUnrelatedCompleted
    expect(secondCompletionEvent).toMatchObject({ jobId: secondUnrelated.id })
    expect(startedBedrock).toEqual([limited.id])
    expect((await harness.queue.getJob(limited.id))?.attemptsMade).toBe(0)
    expect((await harness.queue.getJob(sameGroup.id))?.attemptsMade).toBe(0)
    expect(await (await harness.queue.getJob(sameGroup.id))?.getState()).toBe('delayed')
    expect(delayedEvents).toContainEqual(expect.objectContaining({ jobId: sameGroup.id }))
  })
})
