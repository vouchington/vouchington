import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { SES_INBOUND_RECONCILE_JOB_NAME } from '@ts-shared/ses-inbound-contract'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { sesInboundWorkConfig } from './work-limits.mts'
import { processSesInboundEmail, reconcileSesInboundEmails } from './processors.mts'
import { listCopyrightSesInboundObjects } from './processors/s3.mts'

type ReconcileDependencies = Required<NonNullable<Parameters<typeof reconcileSesInboundEmails>[1]>>

describe('reconcileSesInboundEmails without an SES inbound bucket', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([undefined, '', '   '])(
    'still fails an S3 operation that needs the bucket when S3_BUCKET_SES_INBOUND is %j',
    async bucket => {
      vi.stubEnv('S3_BUCKET_SES_INBOUND', bucket)

      await expect(listCopyrightSesInboundObjects()).rejects.toThrow(
        'S3_BUCKET_SES_INBOUND is required',
      )
    },
  )

  it.each([undefined, '', '   '])(
    'skips loudly instead of throwing when S3_BUCKET_SES_INBOUND is %j',
    async bucket => {
      vi.stubEnv('S3_BUCKET_SES_INBOUND', bucket)
      const listCopyrightSesInboundObjects = vi.fn<() => Promise<never>>()

      await expect(
        reconcileSesInboundEmails({}, { listCopyrightSesInboundObjects }),
      ).resolves.toEqual({
        enqueued: 0,
        hasMore: false,
      })

      expect(listCopyrightSesInboundObjects).not.toHaveBeenCalled()
      expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
        'scheduled_job_config_missing',
        {
          level: 'warning',
          tags: {
            reason: 'scheduled_job_config_missing',
            jobName: SES_INBOUND_RECONCILE_JOB_NAME,
            missingEnvVar: 'S3_BUCKET_SES_INBOUND',
          },
        },
      )
    },
  )
})

describe('SES inbound reconciliation pages', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('caps a run and enqueues one token continuation', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const restore = overrideDynamicConfigFieldsForTest(sesInboundWorkConfig, {
      reconcile_max_pages_per_run: 1,
    })
    try {
      const listObjects = vi
        .fn<(token?: string) => Promise<{ objectKeys: string[]; nextContinuationToken?: string }>>()
        .mockResolvedValue({
          objectKeys: ['copyright-incoming/ses-a'],
          nextContinuationToken: 'opaque:token',
        })
      const enqueueProcess = vi
        .fn<ReconcileDependencies['enqueueOrRetryBulkSesInboundProcess']>()
        .mockResolvedValue(0)
      const enqueueContinuation = vi
        .fn<ReconcileDependencies['enqueueSesInboundReconcileContinuation']>()
        .mockResolvedValue(null)
      const readFailedJobs = vi
        .fn<ReconcileDependencies['readRetainedFailedSesInboundProcessJobs']>()
        .mockResolvedValue([])

      await expect(
        reconcileSesInboundEmails(
          {},
          {
            listCopyrightSesInboundObjects: listObjects,
            enqueueOrRetryBulkSesInboundProcess: enqueueProcess,
            enqueueSesInboundReconcileContinuation: enqueueContinuation,
            readRetainedFailedSesInboundProcessJobs: readFailedJobs,
          },
        ),
      ).resolves.toEqual({ enqueued: 1, hasMore: true })
      expect(listObjects).toHaveBeenCalledExactlyOnceWith(undefined)
      expect(readFailedJobs).toHaveBeenCalledOnce()
      expect(enqueueProcess).toHaveBeenCalledWith(
        [{ sesMessageId: 'ses-a', objectKey: 'copyright-incoming/ses-a' }],
        [],
      )
      expect(enqueueContinuation).toHaveBeenCalledExactlyOnceWith('opaque:token')
    } finally {
      restore()
    }
  })

  it('resumes at an incoming token and does not continue after the last page', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const listObjects = vi
      .fn<(token?: string) => Promise<{ objectKeys: string[] }>>()
      .mockResolvedValue({ objectKeys: [] })
    const enqueueContinuation = vi
      .fn<ReconcileDependencies['enqueueSesInboundReconcileContinuation']>()
      .mockResolvedValue(null)
    await expect(
      reconcileSesInboundEmails(
        { continuationToken: 'resume:here' },
        {
          listCopyrightSesInboundObjects: listObjects,
          enqueueSesInboundReconcileContinuation: enqueueContinuation,
          readRetainedFailedSesInboundProcessJobs: async () => [],
        },
      ),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
    expect(listObjects).toHaveBeenCalledExactlyOnceWith('resume:here')
    expect(enqueueContinuation).not.toHaveBeenCalled()
  })

  it('reads retained failed jobs once and filters the same list across pages', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const restore = overrideDynamicConfigFieldsForTest(sesInboundWorkConfig, {
      reconcile_max_pages_per_run: 2,
    })
    try {
      const failedJob = {
        id: 'failed-process',
        name: 'processInboundEmail',
        retry: vi.fn<() => Promise<void>>(),
      }
      const failedJobs = [failedJob]
      const readFailedJobs = vi
        .fn<ReconcileDependencies['readRetainedFailedSesInboundProcessJobs']>()
        .mockResolvedValue(failedJobs)
      const listObjects = vi
        .fn<ReconcileDependencies['listCopyrightSesInboundObjects']>()
        .mockResolvedValueOnce({
          objectKeys: ['copyright-incoming/ses-a'],
          nextContinuationToken: 'next',
        })
        .mockResolvedValueOnce({ objectKeys: ['copyright-incoming/ses-b'] })
      const enqueueProcess = vi
        .fn<ReconcileDependencies['enqueueOrRetryBulkSesInboundProcess']>()
        .mockResolvedValue(0)

      await expect(
        reconcileSesInboundEmails(
          {},
          {
            listCopyrightSesInboundObjects: listObjects,
            enqueueOrRetryBulkSesInboundProcess: enqueueProcess,
            readRetainedFailedSesInboundProcessJobs: readFailedJobs,
          },
        ),
      ).resolves.toEqual({ enqueued: 2, hasMore: false })
      expect(readFailedJobs).toHaveBeenCalledOnce()
      expect(enqueueProcess).toHaveBeenNthCalledWith(
        1,
        [{ sesMessageId: 'ses-a', objectKey: 'copyright-incoming/ses-a' }],
        failedJobs,
      )
      expect(enqueueProcess).toHaveBeenNthCalledWith(
        2,
        [{ sesMessageId: 'ses-b', objectKey: 'copyright-incoming/ses-b' }],
        failedJobs,
      )
    } finally {
      restore()
    }
  })

  it.each([
    null,
    { continuationToken: '' },
    { continuationToken: 12 },
    { continuationToken: 'x'.repeat(1025) },
  ])('rejects invalid job data before S3 work: %j', async data => {
    const listObjects = vi.fn<() => Promise<never>>()
    await expect(
      reconcileSesInboundEmails(data as never, {
        listCopyrightSesInboundObjects: listObjects,
      }),
    ).rejects.toThrow('SES inbound')
    expect(listObjects).not.toHaveBeenCalled()
  })
})

type ProcessDependencies = Required<NonNullable<Parameters<typeof processSesInboundEmail>[1]>>

function createDependencySpies() {
  return {
    copySesInboundObjectToCopyrightEvidence:
      vi.fn<ProcessDependencies['copySesInboundObjectToCopyrightEvidence']>(),
    createCopyrightEmailIntake: vi.fn<ProcessDependencies['createCopyrightEmailIntake']>(),
    deleteSesInboundObject: vi.fn<ProcessDependencies['deleteSesInboundObject']>(),
    enqueueCopyrightEmailIntakeAndWait:
      vi.fn<ProcessDependencies['enqueueCopyrightEmailIntakeAndWait']>(),
    loadSesInboundObject: vi.fn<ProcessDependencies['loadSesInboundObject']>(),
    loadSesInboundObjectAndHash: vi.fn<ProcessDependencies['loadSesInboundObjectAndHash']>(),
    loadSesInboundObjectVersion: vi.fn<ProcessDependencies['loadSesInboundObjectVersion']>(),
    moveSesInboundObjectToFailed: vi.fn<ProcessDependencies['moveSesInboundObjectToFailed']>(),
    parseSesInboundMime: vi.fn<ProcessDependencies['parseSesInboundMime']>(),
    recordCopyrightEmailParse: vi.fn<ProcessDependencies['recordCopyrightEmailParse']>(),
  } satisfies ProcessDependencies
}

describe('processSesInboundEmail key boundary', () => {
  it('rejects a non-copyright key before any copy, write, parse, enqueue or source change', async () => {
    const dependencies = createDependencySpies()

    await expect(
      processSesInboundEmail(
        {
          sesMessageId: 'ses-unhandled-message',
          objectKey: 'incoming/ses-unhandled-message',
        },
        dependencies,
      ),
    ).rejects.toThrow('unknown prefix')

    // Neither delete nor move may run: the source object stays at its original key.
    expect(dependencies.deleteSesInboundObject).not.toHaveBeenCalled()
    expect(dependencies.moveSesInboundObjectToFailed).not.toHaveBeenCalled()
    for (const dependency of Object.values(dependencies)) {
      expect(dependency).not.toHaveBeenCalled()
    }
  })

  it('still sends a copyright job through the same dependencies', async () => {
    const dependencies = createDependencySpies()
    dependencies.loadSesInboundObjectAndHash.mockRejectedValue(new Error('S3 is unavailable'))

    await expect(
      processSesInboundEmail(
        {
          sesMessageId: 'ses-copyright-message',
          objectKey: 'copyright-incoming/ses-copyright-message',
        },
        dependencies,
      ),
    ).rejects.toThrow('S3 is unavailable')

    expect(dependencies.loadSesInboundObjectAndHash).toHaveBeenCalledExactlyOnceWith(
      'copyright-incoming/ses-copyright-message',
    )
    expect(dependencies.moveSesInboundObjectToFailed).not.toHaveBeenCalled()
    expect(dependencies.deleteSesInboundObject).not.toHaveBeenCalled()
  })
})
