import { recordScheduledJobConfigMissing } from '@modules/on-error'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { SES_INBOUND_RECONCILE_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import {
  enqueueOrRetryBulkSesInboundProcess,
  enqueueSesInboundReconcileContinuation,
  readRetainedFailedSesInboundProcessJobs,
  type RetryableSesInboundJob,
} from '@queues/ses-inbound/enqueues'
import { enqueueCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'
import {
  assertSesInboundProcessJobData,
  assertSesInboundReconcileJobData,
  getSesMessageIdFromObjectKey,
  type SesInboundProcessJobData,
  type SesInboundReconcileJobData,
} from '@ts-shared/ses-inbound-contract'
import { getSesInboundReconcileMaxPagesPerRun } from '@queues/ses-inbound/config'
import { parseSesInboundMime, SesInboundTerminalError } from './processors/mime.mts'
import { processCopyrightInboundEmail } from './processors/copyright-email.mts'
import {
  deleteSesInboundObject,
  copySesInboundObjectToCopyrightEvidence,
  listCopyrightSesInboundObjects,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
  moveSesInboundObjectToFailed,
  readSesInboundBucket,
} from './processors/s3.mts'

export async function processSesInboundEmail(data: SesInboundProcessJobData): Promise<void> {
  assertSesInboundProcessJobData(data)

  try {
    await processCopyrightInboundEmail(data, {
      copySesInboundObjectToCopyrightEvidence,
      createCopyrightEmailIntake,
      enqueueCopyrightEmailIntake,
      loadSesInboundObjectAndHash,
      loadSesInboundObjectVersion,
      parseSesInboundMime,
      recordCopyrightEmailParse,
    })
    await deleteSesInboundObject(data.objectKey)
  } catch (err) {
    if (!(err instanceof SesInboundTerminalError)) throw err
    await moveSesInboundObjectToFailed(data.objectKey, data.sesMessageId)
    throw new UnrecoverableError(err.message)
  }
}

export async function reconcileSesInboundEmails(
  data: SesInboundReconcileJobData = {},
): Promise<{ enqueued: number; hasMore: boolean }> {
  assertSesInboundReconcileJobData(data)
  // The sweep has nothing to scan without the bucket. Skip loudly (local dev has none) instead of
  // throwing, which would be retried and logged as an error every five minutes. Ingest of a real
  // email still fails on a missing bucket because that job only exists once mail arrived.
  if (!readSesInboundBucket()) {
    recordScheduledJobConfigMissing(SES_INBOUND_RECONCILE_JOB.name, 'S3_BUCKET_SES_INBOUND')
    return { enqueued: 0, hasMore: false }
  }
  const failedJobs = await readRetainedFailedSesInboundProcessJobs()
  return enqueueAllInboundPages(
    data.continuationToken,
    getSesInboundReconcileMaxPagesPerRun(),
    failedJobs,
  )
}

async function enqueueAllInboundPages(
  initialToken: string | undefined,
  maxPages: number,
  failedJobs: RetryableSesInboundJob[],
): Promise<{ enqueued: number; hasMore: boolean }> {
  let continuationToken = initialToken
  let enqueued = 0
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    // oxlint-disable-next-line no-await-in-loop -- each S3 page supplies the next continuation token.
    const page = await listCopyrightSesInboundObjects(continuationToken)
    const jobs = page.objectKeys.map(objectKey => ({
      sesMessageId: getSesMessageIdFromObjectKey(objectKey),
      objectKey,
    }))
    if (jobs.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- the next S3 page starts after this page is enqueued.
      await enqueueOrRetryBulkSesInboundProcess(jobs, failedJobs)
    }
    enqueued += jobs.length
    continuationToken = page.nextContinuationToken
    if (!continuationToken) return { enqueued, hasMore: false }
  }
  await enqueueSesInboundReconcileContinuation(continuationToken!)
  return { enqueued, hasMore: true }
}
