import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueBulkReconcileMicrosoftStoreSources,
  enqueueContinueRecoverMicrosoftStoreSources,
  enqueueRecoverMicrosoftStoreSources,
} from '@queues/memberships/enqueues'
import { memberships } from '@queues/memberships/queues'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { getEnqueuedJobId, isDeduplicatedEnqueue } from '@voucha/test-helpers/queue-jobs'
import {
  getTestMicrosoftStoreRecoveryCursor,
  getTestPendingMicrosoftStoreVerification,
  setTestMicrosoftStoreRecoveryCursor,
  type TestMicrosoftStoreRecoveryCursor,
} from '@voucha/test-helpers/microsoft-store-memberships'
import { membershipWorkConfig } from '@services/memberships/work-limits'
import { createActiveMicrosoftStoreFixture } from '@voucha/test-helpers/microsoft-store-source-fixture'
import { processMicrosoftStoreSource, recoverMicrosoftStoreSources } from './microsoft-store.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('Microsoft Store source recovery with real GlideMQ', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('ignores a reconciliation job when its durable source is absent', async () => {
    await expect(processMicrosoftStoreSource({ sourceId: randomUUID() })).resolves.toBeUndefined()
  })

  it('throttles the durable recovery scan to one job per interval', async () => {
    const first = await enqueueRecoverMicrosoftStoreSources()
    const jobId = `microsoft-store-recovery__${Math.floor(Date.now() / 3_600_000)}`
    const accepted = !isDeduplicatedEnqueue(first)
    try {
      expect(accepted ? getEnqueuedJobId(first) : jobId).toBe(jobId)
      const createdJob = accepted ? await memberships.getJob(jobId) : null
      const createdJobMetadata = createdJob
        ? {
            id: createdJob.id,
            name: createdJob.name,
            data: createdJob.data,
            deduplication: createdJob.opts.deduplication,
          }
        : null
      const expectedJobMetadata = accepted
        ? {
            id: jobId,
            name: 'recoverMicrosoftStoreSources',
            data: {},
            deduplication: {
              id: 'microsoft-store-recovery',
              mode: 'throttle',
              ttl: 3_600_000,
            },
          }
        : null
      expect(createdJobMetadata).toEqual(expectedJobMetadata)
      expect(isDeduplicatedEnqueue(await enqueueRecoverMicrosoftStoreSources())).toBe(true)
    } finally {
      if (accepted) await (await memberships.getJob(jobId))?.remove()
    }
  })

  it('serializes an immediate continuation independently of the hourly throttle', async () => {
    const continuation = await enqueueContinueRecoverMicrosoftStoreSources()
    const jobId = getEnqueuedJobId(continuation)

    try {
      await expect(memberships.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name: 'recoverMicrosoftStoreSources',
        data: {},
        opts: {
          ordering: { key: 'microsoft-store-recovery', concurrency: 1 },
          priority: 100,
        },
      })
      expect((await memberships.getJob(jobId))?.opts.deduplication).toBeUndefined()
    } finally {
      await (await memberships.getJob(jobId))?.remove()
    }
  })

  it('restores a lost known-source job from PostgreSQL and keeps concurrent recovery deduplicated', async () => {
    const fixture = await createActiveMicrosoftStoreFixture()
    const verificationJobId = fixture.verificationId
    let sourceJobId: string | undefined
    let recoveryVerificationId: string | null = null

    try {
      const [enqueued] = await enqueueBulkReconcileMicrosoftStoreSources([
        { sourceId: fixture.sourceId },
      ])
      sourceJobId = getEnqueuedJobId(enqueued)
      const initialJob = await memberships.getJob(sourceJobId)
      if (!initialJob) throw new Error('Expected the known-source enqueue to create its stable job')

      // Simulate Valkey losing the accepted job while the active source remains durable in PostgreSQL.
      await initialJob.remove()
      await expect(memberships.getJob(sourceJobId)).resolves.toBeNull()

      await expect(recoverMicrosoftStoreSources()).resolves.toBeUndefined()
      await Promise.all([recoverMicrosoftStoreSources(), recoverMicrosoftStoreSources()])

      await expect(memberships.getJob(sourceJobId)).resolves.toMatchObject({
        id: sourceJobId,
        name: 'reconcileMicrosoftStoreSource',
        data: { sourceId: fixture.sourceId },
        opts: {
          deduplication: { id: sourceJobId, mode: 'simple' },
          ordering: { key: `microsoft-store-source:${fixture.sourceId}`, concurrency: 1 },
        },
      })
      await processMicrosoftStoreSource({ sourceId: fixture.sourceId })
      recoveryVerificationId = await getTestPendingMicrosoftStoreVerification({
        userId: fixture.userId,
        applicationId: fixture.applicationId,
      })
      if (!recoveryVerificationId)
        throw new Error('Expected source recovery to admit a membership verification')
      await expect(memberships.getJob(recoveryVerificationId)).resolves.toMatchObject({
        id: recoveryVerificationId,
        name: 'processMembershipVerification',
        data: { verificationId: recoveryVerificationId },
      })
    } finally {
      await Promise.all(
        [sourceJobId, verificationJobId, recoveryVerificationId].map(async jobId => {
          if (!jobId) return
          await (await memberships.getJob(jobId))?.remove()
        }),
      )
    }
  })

  describe('recovery cursor page protocol', () => {
    it('chains a continuation after a full page advances the cursor', async () => {
      await withRecoveryPage(async ({ first, second, jobs }) => {
        await setTestMicrosoftStoreRecoveryCursor({
          cursor: uuidBefore(first),
          upperBound: second,
        })

        await recoverMicrosoftStoreSources()

        await expect(jobs.reconcileJob(first)).resolves.toMatchObject({ data: { sourceId: first } })
        await expect(getTestMicrosoftStoreRecoveryCursor()).resolves.toEqual({
          cursor: first,
          upperBound: second,
        })
        expect(await jobs.continuationCount()).toBe(1)
      })
    })

    it('does not chain after the page that completes the sweep', async () => {
      await withRecoveryPage(async ({ second, jobs }) => {
        await setTestMicrosoftStoreRecoveryCursor({
          cursor: uuidBefore(second),
          upperBound: second,
        })

        await recoverMicrosoftStoreSources()

        await expect(jobs.reconcileJob(second)).resolves.toMatchObject({
          data: { sourceId: second },
        })
        await expect(getTestMicrosoftStoreRecoveryCursor()).resolves.toEqual({
          cursor: null,
          upperBound: null,
        })
        expect(await jobs.continuationCount()).toBe(0)
      })
    })

    it('does not chain when another recovery moved the cursor first', async () => {
      await withRecoveryPage(async ({ first, second, jobs }) => {
        await setTestMicrosoftStoreRecoveryCursor({
          cursor: uuidBefore(first),
          upperBound: second,
        })
        const movedCursor = { cursor: second, upperBound: second }
        const enqueueBulk = memberships.addBulk
        vi.spyOn(memberships, 'addBulk').mockImplementationOnce(async (...args) => {
          const added = await Reflect.apply(enqueueBulk, memberships, args)
          await setTestMicrosoftStoreRecoveryCursor(movedCursor)
          return added
        })

        await recoverMicrosoftStoreSources()

        await expect(getTestMicrosoftStoreRecoveryCursor()).resolves.toEqual(movedCursor)
        expect(await jobs.continuationCount()).toBe(0)
      })
    })

    it('leaves the cursor in place when the bulk enqueue rejects', async () => {
      await withRecoveryPage(async ({ first, second, jobs }) => {
        const before = { cursor: uuidBefore(first), upperBound: second }
        await setTestMicrosoftStoreRecoveryCursor(before)
        const failure = new Error('bulk enqueue failed')
        vi.spyOn(memberships, 'addBulk').mockRejectedValueOnce(failure)

        await expect(recoverMicrosoftStoreSources()).rejects.toBe(failure)

        await expect(getTestMicrosoftStoreRecoveryCursor()).resolves.toEqual(before)
        expect(await jobs.continuationCount()).toBe(0)
      })
    })
  })
})

type RecoveryPageJobs = {
  reconcileJob: (sourceId: string) => ReturnType<typeof memberships.getJob>
  continuationCount: () => Promise<number>
}

// Runs a case against two owned sources (first < second) with one-source recovery pages, then
// restores the shared singleton cursor and removes the jobs the case created.
async function withRecoveryPage(
  run: (page: { first: string; second: string; jobs: RecoveryPageJobs }) => Promise<void>,
): Promise<void> {
  const [first, second] = [
    (await createActiveMicrosoftStoreFixture()).sourceId,
    (await createActiveMicrosoftStoreFixture()).sourceId,
  ].toSorted()
  if (!first || !second) throw new Error('Expected two recovery sources')
  const savedCursor: TestMicrosoftStoreRecoveryCursor =
    (await getTestMicrosoftStoreRecoveryCursor()) ?? {
      cursor: null,
      upperBound: null,
    }
  const restoreConfig = overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
    source_recovery_batch_size: 1,
  })
  const addSpy = vi.spyOn(memberships, 'add')
  const addBulkSpy = vi.spyOn(memberships, 'addBulk')
  const jobIds: string[] = []
  const collectJobs = async () => {
    const continuations = addSpy.mock.calls.flatMap((call, index) =>
      call[0] === 'recoverMicrosoftStoreSources' ? [addSpy.mock.results[index]?.value] : [],
    )
    const bulks = addBulkSpy.mock.results.map(result => result.value)
    const settled = await Promise.allSettled([...continuations, ...bulks])
    return settled.flatMap(result => (result.status === 'fulfilled' ? result.value : [])).flat()
  }
  const jobs: RecoveryPageJobs = {
    reconcileJob: async sourceId => {
      const job = (await collectJobs()).find(added => added?.data?.sourceId === sourceId)
      if (!job) return null
      jobIds.push(job.id)
      return memberships.getJob(job.id)
    },
    continuationCount: async () =>
      addSpy.mock.calls.filter(call => call[0] === 'recoverMicrosoftStoreSources').length,
  }
  try {
    await run({ first, second, jobs })
  } finally {
    restoreConfig()
    await setTestMicrosoftStoreRecoveryCursor(savedCursor)
    const created = (await collectJobs()).map(job => job?.id)
    await Promise.all(
      [...jobIds, ...created].map(async id => id && (await memberships.getJob(id))?.remove()),
    )
  }
}
