import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  readEnqueuedJob,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { DSA_TEST_UUID } from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import {
  DSA_TEST_PROVIDER_ORIGIN,
  stubDsaTransparencyDatabaseProvider,
} from '@voucha/test-helpers/dsa-transparency-database-provider'
import {
  createTestDsaSubmission,
  readTestDsaAttempts,
  readTestDsaSubmission,
  seedTestDsaDeadLetter,
  countTestDsaSubmissionsForRestriction,
  makeTestDsaSubmissionDue,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import { useDsaStatementSubmissions } from '@voucha/test-helpers/dsa-switches'
import { copyrightConfig } from '@services/copyright-notices/config'
import { enqueueSubmitDsaStatementOfReasons } from '@queues/notifications/enqueues'
import { notifications } from '@queues/notifications/queues'
import { replayDsaStatementSubmission } from '@services/copyright-notices/dsa-statement-submission-replay'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { rejectNextBackgroundJobAddBulkForTest } from '@voucha/test-helpers/injected-failures'
import {
  processReconcileDsaStatementSubmissions,
  processSubmitDsaStatementOfReasons,
} from './copyright-dsa-submission.mts'

function submit(submissionId: string) {
  return processSubmitDsaStatementOfReasons({ submissionId })
}

describe('DSA submission notification processor with the audited switch enabled', () => {
  useDsaStatementSubmissions()
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('reads its real queued ID and commits one provider success through the processor', async () => {
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', `${DSA_TEST_PROVIDER_ORIGIN}/api/v1`)
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
    const id = await createTestDsaSubmission()
    const job = await readEnqueuedJob(notifications, await enqueueSubmitDsaStatementOfReasons(id))
    expect(job.name).toBe('notifications.processSubmitDsaStatementOfReasons')
    expect(job.data).toEqual({ submissionId: id })
    const provider = stubDsaTransparencyDatabaseProvider()
    await expect(
      processSubmitDsaStatementOfReasons(job.data as { submissionId: string }),
    ).resolves.toMatchObject({ status: 'submitted', recorded: true })
    expect(provider.requests).toBe(1)
    expect((await readTestDsaSubmission(id)).transparency_database_uuid).toBe(DSA_TEST_UUID)
    expect(await readTestDsaAttempts(id)).toMatchObject([
      { attempt_number: 1, outcome: 'submitted' },
    ])
    expect(
      (await processSubmitDsaStatementOfReasons(job.data as { submissionId: string })).status,
    ).toBe('not_claimable')
    expect(provider.requests).toBe(1)
  })

  it('leaves dead letters unsent until replay and then submits that queued row', async () => {
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', `${DSA_TEST_PROVIDER_ORIGIN}/api/v1`)
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
    const id = await createTestDsaSubmission()
    await seedTestDsaDeadLetter(id)
    const provider = stubDsaTransparencyDatabaseProvider()
    expect((await submit(id)).status).toBe('dead_lettered')
    expect(provider.requests).toBe(0)
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(true)
    const job = await readEnqueuedJob(notifications, await enqueueSubmitDsaStatementOfReasons(id))
    expect(job.data).toEqual({ submissionId: id })
    await expect(
      processSubmitDsaStatementOfReasons(job.data as { submissionId: string }),
    ).resolves.toMatchObject({ status: 'submitted', recorded: true })
    expect((await readTestDsaAttempts(id)).map(row => row.outcome)).toEqual([
      ...Array(5).fill('retryable_failure'),
      'replayed',
      'submitted',
    ])
    expect(provider.requests).toBe(1)
  })
})

describe('DSA submission notification processor while disabled', () => {
  useDsaStatementSubmissions()
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps a queued durable row pending without making an external call', async () => {
    const id = await createTestDsaSubmission()
    const job = await readEnqueuedJob(notifications, await enqueueSubmitDsaStatementOfReasons(id))
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, { dsaSorDatabase: false })
    try {
      const provider = stubDsaTransparencyDatabaseProvider()
      expect(
        (await processSubmitDsaStatementOfReasons(job.data as { submissionId: string })).status,
      ).toBe('disabled')
      expect(provider.requests).toBe(0)
      expect(await readTestDsaAttempts(id)).toEqual([])
      expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
    } finally {
      restore()
    }
  })
})

describe('DSA statement reconciliation notification processor', () => {
  useDsaStatementSubmissions()
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('leaves durable work untouched when the submission gate is closed', async () => {
    const submissionId = await createTestDsaSubmission()
    const excludedId = await createTestDsaSubmission()
    await makeTestDsaSubmissionDue(submissionId)
    await makeTestDsaSubmissionDue(excludedId)
    const excludedRestriction = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, { dsaSorDatabase: false })
    try {
      await expect(
        processReconcileDsaStatementSubmissions(
          { restrictionIds: [], submissionIds: [submissionId] },
          1,
        ),
      ).resolves.toEqual({ enqueued: 0, hasMore: false })
      expect(await readTestDsaAttempts(submissionId)).toEqual([])
      expect((await readTestDsaSubmission(excludedId)).lease_token).toBeNull()
      expect(await countTestDsaSubmissionsForRestriction(excludedRestriction.restrictionId)).toBe(0)
      expect(
        (await readAllQueueJobs(notifications)).filter(
          job =>
            job.name === 'notifications.processSubmitDsaStatementOfReasons' &&
            [submissionId, excludedId].includes(
              (job.data as { submissionId: string }).submissionId,
            ),
        ),
      ).toEqual([])
    } finally {
      restore()
    }
  })

  it('enqueues each due durable ID once from a bounded page without claiming it', async () => {
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', `${DSA_TEST_PROVIDER_ORIGIN}/api/v1`)
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
    const firstId = await createTestDsaSubmission()
    const secondId = await createTestDsaSubmission()
    const excludedId = await createTestDsaSubmission()
    await makeTestDsaSubmissionDue(firstId)
    await makeTestDsaSubmissionDue(secondId)
    await makeTestDsaSubmissionDue(excludedId)
    const excludedRestriction = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    await expect(
      processReconcileDsaStatementSubmissions(
        { restrictionIds: [], submissionIds: [firstId, secondId] },
        2,
      ),
    ).resolves.toEqual({ enqueued: 2, hasMore: false })
    const enqueuedJobs = (await readAllQueueJobs(notifications)).filter(
      job =>
        job.name === 'notifications.processSubmitDsaStatementOfReasons' &&
        [firstId, secondId, excludedId].includes(
          (job.data as { submissionId: string }).submissionId,
        ),
    )
    expect(enqueuedJobs).toMatchObject([
      {
        name: 'notifications.processSubmitDsaStatementOfReasons',
        data: { submissionId: firstId },
        opts: {
          attempts: 3,
          priority: 10,
          backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
      {
        name: 'notifications.processSubmitDsaStatementOfReasons',
        data: { submissionId: secondId },
        opts: {
          attempts: 3,
          priority: 10,
          backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    ])
    expect(await readTestDsaAttempts(firstId)).toEqual([])
    expect(await readTestDsaAttempts(secondId)).toEqual([])
    expect((await readTestDsaSubmission(excludedId)).lease_token).toBeNull()
    expect(await countTestDsaSubmissionsForRestriction(excludedRestriction.restrictionId)).toBe(0)
  })

  it('fails the reconciliation job if bulk page admission fails', async () => {
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', `${DSA_TEST_PROVIDER_ORIGIN}/api/v1`)
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
    const submissionId = await createTestDsaSubmission()
    const excludedId = await createTestDsaSubmission()
    await makeTestDsaSubmissionDue(submissionId)
    await makeTestDsaSubmissionDue(excludedId)
    const excludedRestriction = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const failure = new Error('bulk enqueue failed')
    const restore = rejectNextBackgroundJobAddBulkForTest(
      'notifications.processSubmitDsaStatementOfReasons',
      failure,
    )
    try {
      await expect(
        processReconcileDsaStatementSubmissions(
          { restrictionIds: [], submissionIds: [submissionId] },
          1,
        ),
      ).rejects.toBe(failure)
      expect(await readTestDsaAttempts(submissionId)).toEqual([])
      expect((await readTestDsaSubmission(excludedId)).lease_token).toBeNull()
      expect(await countTestDsaSubmissionsForRestriction(excludedRestriction.restrictionId)).toBe(0)
      expect(
        (await readAllQueueJobs(notifications)).filter(
          job =>
            job.name === 'notifications.processSubmitDsaStatementOfReasons' &&
            [submissionId, excludedId].includes(
              (job.data as { submissionId: string }).submissionId,
            ),
        ),
      ).toEqual([])
    } finally {
      restore()
    }
  })
})
