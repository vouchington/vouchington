import { randomUUID } from 'node:crypto'
import { Job, Queue, type Worker } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-glide-mq'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '@data-stores/valkey-glide-mq/glide-mq-admission'
import { CONTENT_ANALYSIS_QUEUE_NAME } from '@queues/content-analysis/config'
import { getImageByIdFromPrimary } from '@services/images/get'
import {
  createContentAnalysisCleanupFixtures,
  installContentAnalysisCleanupStorage,
  readContentAnalysisUserLanguage,
  readOwnedContentAnalysisJob,
} from '@voucha/test-helpers/content-analysis-cleanup-fixtures'
import { createContentAnalysisWorker } from './workers/create-content-analysis-worker.mts'

// Exercise native queue admission and worker dispatch for every registered job name.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const JOB_NAMES = [
  'post',
  'rss_feed_item',
  'crawl',
  'community',
  'user',
  'topic',
  'backfill_posts',
  'backfill_rss_feed_items',
  'backfill_crawls',
  'backfill_communities',
  'backfill_users',
  'backfill_topics',
  'staydown-hash',
  'cleanup-abandoned-uploads',
] as const

describe('content-analysis worker dispatch', () => {
  it('routes every language, backfill, staydown and cleanup job to its handler', async () => {
    const prefix = `content-analysis-${randomUUID()}`
    let queue: Queue | undefined
    let worker: Worker | undefined
    let closed = false
    let operation: Promise<void> | undefined
    const settled = Promise.withResolvers<void>()
    const admissions: EnqueueAdmission[] = []
    const fixtureIds = new Set<string>()
    let ownedImageIds: readonly string[] = []
    let ownedUserTags: readonly string[] = []
    const cleanupErrors: unknown[] = []
    let off = () => {}
    let restoreS3 = () => {}
    let cleanup: Promise<void> | undefined
    let reported = false
    const attempt = async (action: () => unknown) => {
      try {
        await action()
      } catch (err) {
        cleanupErrors.push(err)
      }
    }
    const finish = () =>
      (cleanup ??= (async () => {
        closed = true
        settled.reject(new Error('Content-analysis owner closed before completion'))
        if (operation) await Promise.allSettled([operation])
        const beforeClose = cleanupErrors.length
        await attempt(() => worker?.close())
        const imageIds = ownedImageIds
        const userTags = ownedUserTags
        for (const event of admissions) {
          await attempt(async () => {
            const completed = await event.completion
            for (const admitted of Array.isArray(completed) ? completed : [completed]) {
              await attempt(async () => {
                const job = await readOwnedContentAnalysisJob(event, admitted, imageIds, userTags)
                await job.remove()
              })
            }
          })
        }
        if (queue) {
          if (cleanupErrors.length === beforeClose) await attempt(() => queue!.obliterate())
          await attempt(() => queue!.close())
        }
        await attempt(off)
        await attempt(restoreS3)
      })())
    const takeErrors = () => {
      if (reported) return []
      reported = true
      return [...cleanupErrors]
    }
    // Acquire nothing until timeout cleanup can fence new work and join the whole operation.
    onTestFinished(async () => {
      await finish()
      const errors = takeErrors()
      if (errors.length) throw new AggregateError(errors, 'Content-analysis teardown failed')
    })
    // The terminal wait is joined below; attach its rejection handler before fixture acquisition.
    const terminal = Promise.allSettled([settled.promise])
    let failed = false
    let primary: unknown
    try {
      operation = (async () => {
        const fixtures = await createContentAnalysisCleanupFixtures()
        if (closed) throw new Error('Content-analysis owner already closed')
        const ownedIds = [...fixtures.scope.imageIds]
        ownedImageIds = Object.freeze([...ownedIds])
        ownedUserTags = Object.freeze([...fixtures.ownedUserTags])
        const fixtureTags = new Set([...ownedUserTags, ...fixtures.foreignUserTags])
        for (const id of [...ownedIds, ...fixtures.foreignIds]) fixtureIds.add(id)
        const { deletedKeys, restore } = installContentAnalysisCleanupStorage(ownedIds)
        restoreS3 = restore
        off = onEnqueueAdmission(event => {
          if (
            event.queue === fixtures.recoveryQueue &&
            event.inputs.some(
              input =>
                typeof input === 'object' &&
                input !== null &&
                'id' in input &&
                typeof input.id === 'string' &&
                fixtureIds.has(input.id),
            )
          )
            admissions.push(event)
          if (
            event.queue === fixtures.purgeQueue &&
            event.jobName === 'processPurgeCacheTag' &&
            event.inputs.some(
              input =>
                typeof input === 'object' &&
                input !== null &&
                'tags' in input &&
                Array.isArray(input.tags) &&
                input.tags.some(tag => typeof tag === 'string' && fixtureTags.has(tag)),
            )
          )
            admissions.push(event)
          return undefined
        })
        queue = new Queue(CONTENT_ANALYSIS_QUEUE_NAME, {
          connection: workerQueueConnection,
          prefix,
        })
        worker = createContentAnalysisWorker(prefix, {}, fixtures.scope)
        // Caller mutation must not widen the factory's captured ownership or move its clock.
        fixtures.scope.imageIds.push(...fixtures.foreignIds)
        fixtures.scope.entityIds.push(fixtures.foreignUserId)
        fixtures.scope.now.setTime(0)
        await worker.waitUntilReady()
        if (closed) throw new Error('Content-analysis owner already closed')
        const completedNames = new Set<string>()
        const backfillResults = new Map<string, unknown>()
        let cleanupResult: unknown
        worker.on('completed', (job, result) => {
          if (job.name.startsWith('backfill_')) backfillResults.set(job.name, result)
          if (job.name === 'cleanup-abandoned-uploads') cleanupResult = result
          completedNames.add(job.name)
          if (completedNames.size === JOB_NAMES.length) settled.resolve()
        })
        worker.on('failed', (_job, error) => settled.reject(error))
        await queue.addBulk(
          JOB_NAMES.map(name => ({
            name,
            data:
              name === 'cleanup-abandoned-uploads' || name.startsWith('backfill_')
                ? {}
                : { id: randomUUID() },
            opts: {
              priority:
                name === 'cleanup-abandoned-uploads' || name.startsWith('backfill_') ? 100 : 10,
            },
          })),
        )
        await settled.promise
        expect(completedNames).toEqual(new Set(JOB_NAMES))
        expect(backfillResults.size).toBe(6)
        for (const result of backfillResults.values()) {
          expect(result).toEqual({ updated: expect.any(Number) })
        }
        expect(backfillResults).toEqual(
          new Map([
            ['backfill_posts', { updated: 0 }],
            ['backfill_rss_feed_items', { updated: 0 }],
            ['backfill_crawls', { updated: 0 }],
            ['backfill_communities', { updated: 0 }],
            ['backfill_users', { updated: 1 }],
            ['backfill_topics', { updated: 0 }],
          ]),
        )
        expect(cleanupResult).toEqual({
          cleaned: expect.any(Number),
          recovered: expect.any(Number),
          stagedSourcesDeleted: expect.any(Number),
        })
        expect(cleanupResult).toEqual({ cleaned: 1, recovered: 1, stagedSourcesDeleted: 1 })
        expect(backfillResults.get('backfill_users')).toEqual({ updated: 1 })
        expect(await readContentAnalysisUserLanguage(fixtures.foreignUserId)).toEqual(
          fixtures.foreignLanguageBefore,
        )
        expect(
          await Promise.all(fixtures.foreignIds.map(id => getImageByIdFromPrimary(id, true))),
        ).toEqual(fixtures.foreignBefore)
        expect(deletedKeys.toSorted()).toEqual(ownedIds.toSorted())
        const recoveryAdmissions = admissions.filter(
          event => event.queue === fixtures.recoveryQueue,
        )
        const purgeAdmissions = admissions.filter(event => event.queue === fixtures.purgeQueue)
        expect(recoveryAdmissions).toHaveLength(1)
        expect(purgeAdmissions).toHaveLength(1)
        const admitted = await recoveryAdmissions[0]!.completion
        if (!(admitted instanceof Job)) throw new Error('Missing native recovery job')
        const persisted = await readOwnedContentAnalysisJob(
          recoveryAdmissions[0]!,
          admitted,
          ownedImageIds,
          ownedUserTags,
        )
        expect(persisted.name).toBe('extract-metadata')
        expect(persisted.data).toEqual({ id: fixtures.ownedRecovery })
        const purged = await purgeAdmissions[0]!.completion
        if (!Array.isArray(purged) || purged.length !== 1)
          throw new Error('Missing native bulk purge job')
        const purgeJob = await readOwnedContentAnalysisJob(
          purgeAdmissions[0]!,
          purged[0],
          ownedImageIds,
          ownedUserTags,
        )
        expect(purgeJob.name).toBe('processPurgeCacheTag')
        expect(purgeJob.data).toEqual({ tags: fixtures.ownedUserTags })
        expect(
          (await getImageByIdFromPrimary(fixtures.ownedPending, true))?.deleted_at,
        ).toBeInstanceOf(Date)
        expect(
          (await getImageByIdFromPrimary(fixtures.ownedRecovery))?.upload_source_deleted_at,
        ).toBeInstanceOf(Date)
      })()
      await operation
    } catch (err) {
      failed = true
      primary = err
    } finally {
      await finish()
      await terminal
    }
    const errors = takeErrors()
    if (errors.length)
      throw new AggregateError(errors, 'Content-analysis cleanup failed', {
        cause: failed ? primary : errors[0],
      })
    if (failed) throw primary
  })
})
