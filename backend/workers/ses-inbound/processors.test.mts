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
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import {
  emulatorS3,
  listS3Keys,
  putS3Object,
  readS3ObjectText,
  s3ObjectExists,
} from '@voucha/test-helpers/aws-emulator-s3'
import { clearS3ObjectDenials, denyS3ObjectActions } from '@voucha/test-helpers/s3-owned-bucket'
import {
  capS3ImagesClientListPageSizeForTest,
  omitS3ImagesClientResponseFieldsForTest,
} from '@voucha/test-helpers/s3-images-client-injection'
import { useSesInboundBucket } from '@voucha/test-helpers/ses-inbound-s3'
import { getSesInboundProcessJobOptions } from '@ts-shared/ses-inbound-contract'
import { sesInboundWorkConfig } from '@queues/ses-inbound/config'
import { processSesInboundEmail, reconcileSesInboundEmails } from './processors.mts'
import { listCopyrightSesInboundObjects } from './processors/s3.mts'

const continuationJobId = (token: string) =>
  `ses_inbound_reconcile_continuation__${createHash('sha256').update(token).digest('hex')}`

/** The token S3 returns after the first key of a one-key page under the copyright prefix. */
async function firstPageToken(bucket: string): Promise<string> {
  const page = await emulatorS3().send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: 'copyright-incoming/', MaxKeys: 1 }),
  )
  if (!page.NextContinuationToken) throw new Error('Expected a second listing page')
  return page.NextContinuationToken
}

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

      await expect(reconcileSesInboundEmails({})).resolves.toEqual({
        enqueued: 0,
        hasMore: false,
      })

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
  const inbound = useSesInboundBucket()

  async function receive(...keys: Array<{ objectKey: string }>): Promise<void> {
    await Promise.all(
      keys.map(({ objectKey }) =>
        putS3Object({ Bucket: inbound.name(), Key: objectKey, Body: 'raw' }),
      ),
    )
  }

  it('caps a run and enqueues one token continuation', async () => {
    await sesInboundWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sesInboundWorkConfig, { reconcile_max_pages_per_run: 1 }),
    )
    const [first, second] = ownedKeys()
    // A key outside the copyright prefix is never listed.
    await receive(first!, second!, { objectKey: `incoming/${randomUUID()}` })
    // Real pages hold 1,000 keys; one-key pages reach the cap with two objects.
    capS3ImagesClientListPageSizeForTest(inbound.name(), 1)
    const token = await firstPageToken(inbound.name())

    await expect(reconcileSesInboundEmails({})).resolves.toEqual({ enqueued: 1, hasMore: true })

    const processJob = await background.getJob(getSesInboundProcessJobOptions(first!).jobId)
    expect(processJob?.name).toBe(SES_INBOUND_PROCESS_JOB.name)
    expect(processJob?.data).toEqual(first)
    const continuation = await background.getJob(continuationJobId(token))
    expect(continuation?.name).toBe(SES_INBOUND_RECONCILE_JOB.name)
    expect(continuation?.data).toEqual({ continuationToken: token })
    expect(await background.getJob(getSesInboundProcessJobOptions(second!).jobId!)).toBeFalsy()
  })

  it('resumes at an incoming token and does not continue after the last page', async () => {
    const [first, second] = ownedKeys()
    await receive(first!, second!)
    const resumeToken = await firstPageToken(inbound.name())
    const add = vi.spyOn(background, 'add')
    onTestFinished(() => add.mockRestore())

    await expect(reconcileSesInboundEmails({ continuationToken: resumeToken })).resolves.toEqual({
      enqueued: 1,
      hasMore: false,
    })

    // Only the key after the token is enqueued, and no continuation follows the last page.
    expect((await background.getJob(getSesInboundProcessJobOptions(second!).jobId!))?.data).toEqual(
      second,
    )
    expect(await background.getJob(getSesInboundProcessJobOptions(first!).jobId!)).toBeFalsy()
    expect(add).not.toHaveBeenCalled()
  })

  it('reads retained failed jobs once and filters the same list across pages', async () => {
    await sesInboundWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sesInboundWorkConfig, { reconcile_max_pages_per_run: 2 }),
    )
    const [first, second] = ownedKeys()
    await receive(first!, second!)
    capS3ImagesClientListPageSizeForTest(inbound.name(), 1)
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
    // Listing this missing bucket would fail with NoSuchBucket instead of the validation error.
    vi.stubEnv('S3_BUCKET_SES_INBOUND', `missing-ses-inbound-${randomUUID()}`)
    await expect(reconcileSesInboundEmails(data as never)).rejects.toThrow('SES inbound')
  })
})

describe('processSesInboundEmail key boundary', () => {
  const inbound = useSesInboundBucket()

  it('rejects a non-copyright key before any copy, write, parse, enqueue or source change', async () => {
    const objectKey = 'incoming/ses-unhandled-message'
    await putS3Object({ Bucket: inbound.name(), Key: objectKey, Body: 'raw' })

    await expect(
      processSesInboundEmail({ sesMessageId: 'ses-unhandled-message', objectKey }),
    ).rejects.toThrow('unknown prefix')

    // No delete or move ran: the source object stays alone at its original key.
    expect(await listS3Keys(inbound.name(), '')).toEqual([objectKey])
  })

  it('still sends a copyright job through the S3 read', async () => {
    const objectKey = 'copyright-incoming/ses-copyright-message'
    await putS3Object({ Bucket: inbound.name(), Key: objectKey, Body: 'raw' })
    await denyS3ObjectActions(inbound.name(), [{ action: 's3:GetObject', keys: [objectKey] }])

    await expect(
      processSesInboundEmail({ sesMessageId: 'ses-copyright-message', objectKey }),
    ).rejects.toThrow(/not authorized to perform: s3:GetObject/)

    // The source is neither deleted nor moved after a failed read.
    await clearS3ObjectDenials(inbound.name())
    expect(await listS3Keys(inbound.name(), '')).toEqual([objectKey])
  })

  it('moves a source object with no body to the failed prefix and stops retrying it', async () => {
    const objectKey = 'copyright-incoming/ses-bodyless-message'
    await putS3Object({ Bucket: inbound.name(), Key: objectKey, Body: 'raw' })
    // S3 always streams a body, even an empty one, so only a dropped field reaches this guard.
    omitS3ImagesClientResponseFieldsForTest('GetObjectCommand', ['Body'])

    await expect(
      processSesInboundEmail({ sesMessageId: 'ses-bodyless-message', objectKey }),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    expect(await s3ObjectExists(inbound.name(), objectKey)).toBe(false)
    expect(await readS3ObjectText(inbound.name(), 'failed/ses-bodyless-message')).toBe('raw')
  })
})
