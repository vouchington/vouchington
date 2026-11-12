import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QueueEvents, Worker } from 'glide-mq'
import { throwRateLimited } from '@vouchington/queue-errors'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { getCpuProviderCooldownRemainingMs } from '@services/embeddings/provider-cooldown'
import type { BackgroundCpuHandler, BackgroundCpuJobDefinition } from '@queues/background-cpu/types'
import {
  startRealGlideBackgroundLifecycle,
  type RealGlideBackgroundHarness,
} from '@voucha/test-helpers/real-glide-background-lifecycle'
import {
  acquireContentAnalysisTestReservation,
  waitForQueueDomainTestResult,
} from '@voucha/test-helpers/queue-domain-controls'
import { acquireEmbeddingCreationCooldown } from '@voucha/test-helpers/embedding-creation-cooldown'
import { createBackgroundCpuProcessor } from '../processors.mts'

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const contentPost = requireBackgroundCpuJob('content-analysis.post')
const creationImage = requireBackgroundCpuJob('gemini-embeddings.create_images')
const creationPost = requireBackgroundCpuJob('gemini-embeddings.create_posts')

describe('background-cpu groups through real GlideMQ', () => {
  let harness: RealGlideBackgroundHarness<BackgroundCpuJobDefinition> | undefined
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
          const results = await Promise.allSettled([harness?.close(), events?.close()])
          const errors = results
            .filter(result => result.status === 'rejected')
            .map(result => result.reason)
          if (errors.length)
            throw new AggregateError(errors, 'Provider cooldown resources did not close')
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

  describe('with reserved creation cooldown', () => {
    let cooldown: Awaited<ReturnType<typeof acquireEmbeddingCreationCooldown>>
    let imageAttempts = 0
    let postStarts = 0
    beforeEach(async ({ signal }) => {
      imageAttempts = 0
      postStarts = 0
      const handlers = new Map<string, BackgroundCpuHandler>([
        [
          creationImage.name,
          {
            job: creationImage,
            handle: () => {
              imageAttempts += 1
              if (imageAttempts === 1)
                throwRateLimited(3_000, new Error('Gemini throttled'), {
                  RateLimitError: Worker.RateLimitError,
                })
            },
          },
        ],
        [
          creationPost.name,
          {
            job: creationPost,
            handle: () => {
              postStarts += 1
            },
          },
        ],
        [contentPost.name, { job: contentPost, handle: () => undefined }],
      ])
      harness = await trackWork(signal, () =>
        startRealGlideBackgroundLifecycle<BackgroundCpuJobDefinition>({
          queueNamePrefix: 'background_cpu_creation_cooldown',
          connection,
          processor: createBackgroundCpuProcessor(handlers),
        }),
      )
      events = new QueueEvents(harness.queue.name, {
        ...connection,
        lastEventId: '0',
        blockTimeout: 100,
      })
      await events.waitUntilReady()

      cooldown = await acquireEmbeddingCreationCooldown(signal)
      cooldown.beforeRelease(cleanup)
    })

    it('shares creation cooldown across type lanes while serving other CPU work', async ({
      signal,
    }) => {
      const imageDelayed = waitForQueueDomainTestResult(
        once(events!, 'delay-changed', { signal }),
        signal,
      )
      const image = await trackWork(signal, () => harness!.add(creationImage, {}))
      expect((await imageDelayed)[0]).toMatchObject({ jobId: image.id })
      await cooldown.witnessOwnWrite()
      expect(await getCpuProviderCooldownRemainingMs('gemini-embeddings:creation')).toBeGreaterThan(
        0,
      )

      const postDelayed = waitForQueueDomainTestResult(
        once(events!, 'delay-changed', { signal }),
        signal,
      )
      const post = await trackWork(signal, () => harness!.add(creationPost, {}))
      const other = await trackWork(signal, () => harness!.add(contentPost, { id: randomUUID() }))
      expect((await postDelayed)[0]).toMatchObject({ jobId: post.id })
      expect(await waitForQueueDomainTestResult(harness!.settled(other), signal)).toBe('completed')
      expect(postStarts).toBe(0)
      expect(await (await harness!.queue.getJob(post.id))?.getState()).toBe('delayed')

      const imageCompleted = waitForQueueDomainTestResult(harness!.settled(image), signal)
      const postCompleted = waitForQueueDomainTestResult(harness!.settled(post), signal)
      await cooldown.expire()
      await cooldown.promote(image, imageCompleted)
      await cooldown.promote(post, postCompleted)
      expect(await imageCompleted).toBe('completed')
      expect(await postCompleted).toBe('completed')
      expect(imageAttempts).toBe(2)
      expect(postStarts).toBe(1)
    })
  })
})
