import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import {
  DSA_TEST_UUID,
  dsaTestResponse,
} from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import {
  createTestDsaSubmission,
  readTestDsaAttempts,
  readTestDsaSubmission,
  seedTestDsaDeadLetter,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import { useDsaStatementSubmissions } from '@voucha/test-helpers/dsa-switches'
import { copyrightConfig } from '@services/copyright-notices/config'
import {
  enqueueBulkSubmitDsaStatementOfReasons,
  enqueueSubmitDsaStatementOfReasons,
} from '@queues/notifications/enqueues'
import { notifications } from '@queues/notifications/queues'
import { processDsaStatementSubmission } from '@services/copyright-notices/dsa-statement-submission'
import { replayDsaStatementSubmission } from '@services/copyright-notices/dsa-statement-submission-replay'
import { searchRecoverableDsaStatementSubmissionIds } from '@services/copyright-notices/dsa-statement-submission-sweep'
import {
  processReconcileDsaStatementSubmissions,
  processSubmitDsaStatementOfReasons,
} from './copyright-dsa-submission.mts'

type ExternalFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function fakeProvider() {
  return vi.fn<ExternalFetch>(async () => dsaTestResponse(201, { uuid: DSA_TEST_UUID }))
}

function processWithFetch(fetch: ExternalFetch) {
  return (submissionId: string) =>
    processDsaStatementSubmission(submissionId, { requestFetch: fetch })
}

describe('DSA submission notification processor with the audited switch enabled', () => {
  useDsaStatementSubmissions()
  afterEach(() => vi.unstubAllEnvs())

  it('reads its real queued ID and commits one provider success through the processor', async () => {
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', 'https://synthetic.invalid.europa.eu/api/v1')
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
    const id = await createTestDsaSubmission()
    const job = await readEnqueuedJob(notifications, await enqueueSubmitDsaStatementOfReasons(id))
    expect(job.name).toBe('notifications.processSubmitDsaStatementOfReasons')
    expect(job.data).toEqual({ submissionId: id })
    const fetch = fakeProvider()
    await expect(
      processSubmitDsaStatementOfReasons(job.data as { submissionId: string }, {
        process: processWithFetch(fetch),
      }),
    ).resolves.toMatchObject({ status: 'submitted', recorded: true })
    expect(fetch).toHaveBeenCalledOnce()
    expect((await readTestDsaSubmission(id)).transparency_database_uuid).toBe(DSA_TEST_UUID)
    expect(await readTestDsaAttempts(id)).toMatchObject([
      { attempt_number: 1, outcome: 'submitted' },
    ])
    expect(
      (
        await processSubmitDsaStatementOfReasons(job.data as { submissionId: string }, {
          process: processWithFetch(fetch),
        })
      ).status,
    ).toBe('not_claimable')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('leaves dead letters unsent until replay and then submits that queued row', async () => {
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', 'https://synthetic.invalid.europa.eu/api/v1')
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
    const id = await createTestDsaSubmission()
    await seedTestDsaDeadLetter(id)
    const fetch = fakeProvider()
    expect(
      (
        await processSubmitDsaStatementOfReasons(
          { submissionId: id },
          {
            process: processWithFetch(fetch),
          },
        )
      ).status,
    ).toBe('dead_lettered')
    expect(fetch).not.toHaveBeenCalled()
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(true)
    const job = await readEnqueuedJob(notifications, await enqueueSubmitDsaStatementOfReasons(id))
    expect(job.data).toEqual({ submissionId: id })
    await expect(
      processSubmitDsaStatementOfReasons(job.data as { submissionId: string }, {
        process: processWithFetch(fetch),
      }),
    ).resolves.toMatchObject({ status: 'submitted', recorded: true })
    expect((await readTestDsaAttempts(id)).map(row => row.outcome)).toEqual([
      ...Array(5).fill('retryable_failure'),
      'replayed',
      'submitted',
    ])
    expect(fetch).toHaveBeenCalledOnce()
  })
})

describe('DSA submission notification processor while disabled', () => {
  useDsaStatementSubmissions()
  afterEach(() => vi.unstubAllEnvs())

  it('keeps a queued durable row pending without making an external call', async () => {
    const id = await createTestDsaSubmission()
    const job = await readEnqueuedJob(notifications, await enqueueSubmitDsaStatementOfReasons(id))
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, { dsaSorDatabase: false })
    try {
      const fetch = fakeProvider()
      expect(
        (
          await processSubmitDsaStatementOfReasons(job.data as { submissionId: string }, {
            process: processWithFetch(fetch),
          })
        ).status,
      ).toBe('disabled')
      expect(fetch).not.toHaveBeenCalled()
      expect(await readTestDsaAttempts(id)).toEqual([])
      expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
    } finally {
      restore()
    }
  })
})

describe('DSA statement reconciliation notification processor', () => {
  useDsaStatementSubmissions(false)

  it('leaves durable work untouched when the submission gate is closed', async () => {
    const submissionId = await createTestDsaSubmission()
    const search = vi.fn<typeof searchRecoverableDsaStatementSubmissionIds>(async () => ({
      results: [submissionId],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }))

    await expect(processReconcileDsaStatementSubmissions({ search })).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    expect(search).not.toHaveBeenCalled()
    expect(await readTestDsaAttempts(submissionId)).toEqual([])
  })

  it('enqueues each due durable ID once from a bounded page without claiming it', async () => {
    const firstId = await createTestDsaSubmission()
    const secondId = await createTestDsaSubmission()
    const from = new Date('2020-01-01T00:00:00.000Z')
    const search = vi.fn<typeof searchRecoverableDsaStatementSubmissionIds>(async () => ({
      results: [firstId, secondId],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }))
    const enqueuedJobs: unknown[] = []
    const enqueue = vi.fn<typeof enqueueBulkSubmitDsaStatementOfReasons>(async ids => {
      const jobs = await enqueueBulkSubmitDsaStatementOfReasons(ids)
      for (const job of jobs) enqueuedJobs.push(await readEnqueuedJob(notifications, job))
      return jobs
    })

    await expect(
      processReconcileDsaStatementSubmissions({
        prepare: async () => ({ from, hasMore: false }),
        search,
        enqueue,
      }),
    ).resolves.toEqual({ enqueued: 2, hasMore: false })
    expect(search).toHaveBeenCalledExactlyOnceWith({ from, limit: 100 })
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([firstId, secondId])
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
  })

  it('fails the reconciliation job if bulk page admission fails', async () => {
    const submissionId = await createTestDsaSubmission()
    const failure = new Error('bulk enqueue failed')
    const enqueue = vi.fn<typeof enqueueBulkSubmitDsaStatementOfReasons>(async () => {
      throw failure
    })
    await expect(
      processReconcileDsaStatementSubmissions({
        prepare: async () => ({
          from: new Date('2020-01-01T00:00:00.000Z'),
          hasMore: false,
        }),
        search: async () => ({
          results: [submissionId],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }),
        enqueue,
      }),
    ).rejects.toBe(failure)
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([submissionId])
    expect(await readTestDsaAttempts(submissionId)).toEqual([])
  })
})
