import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  SES_INBOUND_PROCESS_JOB,
  SES_INBOUND_RECONCILE_JOB,
} from '@queues/background/enqueues/ses-inbound-jobs'
import { background } from '@queues/background/queues'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { stubSesInboundS3ForTest } from '@voucha/test-helpers/ses-inbound-s3'
import { getSesInboundProcessJobOptions } from '@ts-shared/ses-inbound-contract'
import { sesInboundWorkConfig } from '@queues/ses-inbound/config'
import { processSesInboundEmail, reconcileSesInboundEmails } from './processors.mts'
import { listCopyrightSesInboundObjects } from './processors/s3.mts'

const continuationJobId = (token: string) =>
  `ses_inbound_reconcile_continuation__${createHash('sha256').update(token).digest('hex')}`

function ownedKeys() {
  const suffix = randomUUID()
  return [`ses-a-${suffix}`, `ses-b-${suffix}`].map(sesMessageId => ({
    sesMessageId,
    objectKey: `copyright-incoming/${sesMessageId}`,
  }))
}

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
      const s3Calls = stubSesInboundS3ForTest()

      await expect(reconcileSesInboundEmails({})).resolves.toEqual({
        enqueued: 0,
        hasMore: false,
      })

      expect(s3Calls).toEqual([])
      expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
        'scheduled_job_config_missing',
        {
          level: 'warning',
          tags: {
            reason: 'scheduled_job_config_missing',
            jobName: SES_INBOUND_RECONCILE_JOB.name,
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
    await sesInboundWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sesInboundWorkConfig, { reconcile_max_pages_per_run: 1 }),
    )
    const [first] = ownedKeys()
    const token = `opaque:${randomUUID()}`
    const s3Calls = stubSesInboundS3ForTest({
      listPages: { '': { keys: [first!.objectKey], next: token } },
    })

    await expect(reconcileSesInboundEmails({})).resolves.toEqual({ enqueued: 1, hasMore: true })

    expect(s3Calls).toEqual([
      {
        command: 'ListObjectsV2Command',
        input: { Bucket: 'ses-inbound-test', Prefix: 'copyright-incoming/' },
      },
    ])
    const processJob = await background.getJob(getSesInboundProcessJobOptions(first!).jobId)
    expect(processJob?.name).toBe(SES_INBOUND_PROCESS_JOB.name)
    expect(processJob?.data).toEqual(first)
    const continuation = await background.getJob(continuationJobId(token))
    expect(continuation?.name).toBe(SES_INBOUND_RECONCILE_JOB.name)
    expect(continuation?.data).toEqual({ continuationToken: token })
  })

  it('resumes at an incoming token and does not continue after the last page', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const resumeToken = `resume:${randomUUID()}`
    const s3Calls = stubSesInboundS3ForTest({ listPages: { [resumeToken]: { keys: [] } } })
    const add = vi.spyOn(background, 'add')
    onTestFinished(() => add.mockRestore())

    await expect(reconcileSesInboundEmails({ continuationToken: resumeToken })).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })

    expect(s3Calls).toEqual([
      {
        command: 'ListObjectsV2Command',
        input: {
          Bucket: 'ses-inbound-test',
          Prefix: 'copyright-incoming/',
          ContinuationToken: resumeToken,
        },
      },
    ])
    expect(add).not.toHaveBeenCalled()
  })

  it('reads retained failed jobs once and filters the same list across pages', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    await sesInboundWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sesInboundWorkConfig, { reconcile_max_pages_per_run: 2 }),
    )
    const [first, second] = ownedKeys()
    const token = `next:${randomUUID()}`
    stubSesInboundS3ForTest({
      listPages: {
        '': { keys: [first!.objectKey], next: token },
        [token]: { keys: [second!.objectKey] },
      },
    })
    const failedJobs = [first!, second!].map(data => ({
      id: getSesInboundProcessJobOptions(data).jobId!,
      name: SES_INBOUND_PROCESS_JOB.name,
      retry: vi.fn<() => Promise<void>>(),
    }))
    const searchJobs = vi
      .spyOn(background, 'searchJobs')
      .mockResolvedValue(failedJobs as unknown as Awaited<ReturnType<typeof background.searchJobs>>)
    onTestFinished(() => searchJobs.mockRestore())

    await expect(reconcileSesInboundEmails({})).resolves.toEqual({ enqueued: 2, hasMore: false })

    expect(searchJobs).toHaveBeenCalledOnce()
    for (const failedJob of failedJobs) expect(failedJob.retry).toHaveBeenCalledOnce()
    for (const data of [first!, second!]) {
      expect((await background.getJob(getSesInboundProcessJobOptions(data).jobId!))?.data).toEqual(
        data,
      )
    }
  })

  it.each([
    null,
    { continuationToken: '' },
    { continuationToken: 12 },
    { continuationToken: 'x'.repeat(1025) },
  ])('rejects invalid job data before S3 work: %j', async data => {
    const s3Calls = stubSesInboundS3ForTest()
    await expect(reconcileSesInboundEmails(data as never)).rejects.toThrow('SES inbound')
    expect(s3Calls).toEqual([])
  })
})

describe('processSesInboundEmail key boundary', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rejects a non-copyright key before any copy, write, parse, enqueue or source change', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const s3Calls = stubSesInboundS3ForTest()

    await expect(
      processSesInboundEmail({
        sesMessageId: 'ses-unhandled-message',
        objectKey: 'incoming/ses-unhandled-message',
      }),
    ).rejects.toThrow('unknown prefix')

    // No read, delete or move may run: the source object stays at its original key.
    expect(s3Calls).toEqual([])
  })

  it('still sends a copyright job through the S3 read', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const s3Calls = stubSesInboundS3ForTest({ getError: new Error('S3 is unavailable') })

    await expect(
      processSesInboundEmail({
        sesMessageId: 'ses-copyright-message',
        objectKey: 'copyright-incoming/ses-copyright-message',
      }),
    ).rejects.toThrow('S3 is unavailable')

    // The source is neither deleted nor moved after a retryable read failure.
    expect(s3Calls).toEqual([
      {
        command: 'GetObjectCommand',
        input: { Bucket: 'ses-inbound-test', Key: 'copyright-incoming/ses-copyright-message' },
      },
    ])
  })

  it('moves a source object with no body to the failed prefix and stops retrying it', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const s3Calls = stubSesInboundS3ForTest({ getWithoutBody: true })

    await expect(
      processSesInboundEmail({
        sesMessageId: 'ses-bodyless-message',
        objectKey: 'copyright-incoming/ses-bodyless-message',
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    expect(s3Calls.map(call => call.command)).toEqual([
      'GetObjectCommand',
      'CopyObjectCommand',
      'DeleteObjectCommand',
    ])
    expect(s3Calls[1]!.input).toEqual({
      Bucket: 'ses-inbound-test',
      Key: 'failed/ses-bodyless-message',
      CopySource: 'ses-inbound-test/copyright-incoming/ses-bodyless-message',
    })
    expect(s3Calls[2]!.input).toEqual({
      Bucket: 'ses-inbound-test',
      Key: 'copyright-incoming/ses-bodyless-message',
    })
  })
})
