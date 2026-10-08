import { recordScheduledJobConfigMissing } from '@modules/on-error'
import { UnrecoverableError } from '@modules/queue-errors'
import {
  enqueueOrRetryBulkSesInboundProcess,
  enqueueSesInboundReconcileContinuation,
  readRetainedFailedSesInboundProcessJobs,
  type RetryableSesInboundJob,
} from '@queues/ses-inbound/enqueues'
import { enqueueCopyrightEmailIntakeAndWait } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'
import {
  assertSesInboundProcessJobData,
  assertSesInboundReconcileJobData,
  getSesMessageIdFromObjectKey,
  SES_INBOUND_RECONCILE_JOB_NAME,
  type SesInboundProcessJobData,
  type SesInboundReconcileJobData,
} from '@ts-shared/ses-inbound-contract'
import { getSesInboundReconcileMaxPagesPerRun } from './work-limits.mts'
import { parseSesInboundMime, SesInboundTerminalError } from './processors/mime.mts'
import {
  processCopyrightInboundEmail,
  type CopyrightEmailDependencies,
} from './processors/copyright-email.mts'
import {
  deleteSesInboundObject,
  copySesInboundObjectToCopyrightEvidence,
  listCopyrightSesInboundObjects,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
  loadSesInboundObject,
  moveSesInboundObjectToFailed,
  readSesInboundBucket,
  type SesInboundObjectPage,
} from './processors/s3.mts'

type ProcessDependencies = CopyrightEmailDependencies & {
  deleteSesInboundObject: typeof deleteSesInboundObject
  loadSesInboundObject: typeof loadSesInboundObject
  moveSesInboundObjectToFailed: typeof moveSesInboundObjectToFailed
  parseSesInboundMime: typeof parseSesInboundMime
}

type ReconcileDependencies = {
  enqueueOrRetryBulkSesInboundProcess: typeof enqueueOrRetryBulkSesInboundProcess
  enqueueSesInboundReconcileContinuation: typeof enqueueSesInboundReconcileContinuation
  listCopyrightSesInboundObjects: (continuationToken?: string) => Promise<SesInboundObjectPage>
  readRetainedFailedSesInboundProcessJobs: () => Promise<RetryableSesInboundJob[]>
}

export async function processSesInboundEmail(
  data: SesInboundProcessJobData,
  dependencies?: Partial<ProcessDependencies>,
): Promise<void> {
  assertSesInboundProcessJobData(data)
  const deps = {
    copySesInboundObjectToCopyrightEvidence,
    createCopyrightEmailIntake,
    deleteSesInboundObject,
    enqueueCopyrightEmailIntakeAndWait,
    loadSesInboundObject,
    loadSesInboundObjectAndHash,
    loadSesInboundObjectVersion,
    moveSesInboundObjectToFailed,
    parseSesInboundMime,
    recordCopyrightEmailParse,
    ...dependencies,
  }

  try {
    await processCopyrightInboundEmail(data, deps)
    await deps.deleteSesInboundObject(data.objectKey)
  } catch (err) {
    if (!(err instanceof SesInboundTerminalError)) throw err
    await deps.moveSesInboundObjectToFailed(data.objectKey, data.sesMessageId)
    throw new UnrecoverableError(err.message)
  }
}

export async function reconcileSesInboundEmails(
  data: SesInboundReconcileJobData = {},
  dependencies?: Partial<ReconcileDependencies>,
): Promise<{ enqueued: number; hasMore: boolean }> {
  assertSesInboundReconcileJobData(data)
  // The sweep has nothing to scan without the bucket. Skip loudly (local dev has none) instead of
  // throwing, which would be retried and logged as an error every five minutes. Ingest of a real
  // email still fails on a missing bucket because that job only exists once mail arrived.
  if (!readSesInboundBucket()) {
    recordScheduledJobConfigMissing(SES_INBOUND_RECONCILE_JOB_NAME, 'S3_BUCKET_SES_INBOUND')
    return { enqueued: 0, hasMore: false }
  }
  const listCopyrightObjects =
    dependencies?.listCopyrightSesInboundObjects ?? listCopyrightSesInboundObjects
  const enqueueOrRetry =
    dependencies?.enqueueOrRetryBulkSesInboundProcess ?? enqueueOrRetryBulkSesInboundProcess
  const enqueueContinuation =
    dependencies?.enqueueSesInboundReconcileContinuation ?? enqueueSesInboundReconcileContinuation
  const readFailedJobs =
    dependencies?.readRetainedFailedSesInboundProcessJobs ?? readRetainedFailedSesInboundProcessJobs
  const failedJobs = await readFailedJobs()
  return enqueueAllInboundPages(
    data.continuationToken,
    getSesInboundReconcileMaxPagesPerRun(),
    listCopyrightObjects,
    failedJobs,
    enqueueOrRetry,
    enqueueContinuation,
  )
}

async function enqueueAllInboundPages(
  initialToken: string | undefined,
  maxPages: number,
  listObjects: (continuationToken?: string) => Promise<SesInboundObjectPage>,
  failedJobs: RetryableSesInboundJob[],
  enqueueOrRetry: typeof enqueueOrRetryBulkSesInboundProcess,
  enqueueContinuation: typeof enqueueSesInboundReconcileContinuation,
): Promise<{ enqueued: number; hasMore: boolean }> {
  let continuationToken = initialToken
  let enqueued = 0
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    // oxlint-disable-next-line no-await-in-loop -- each S3 page supplies the next continuation token.
    const page = await listObjects(continuationToken)
    const jobs = page.objectKeys.map(objectKey => ({
      sesMessageId: getSesMessageIdFromObjectKey(objectKey),
      objectKey,
    }))
    if (jobs.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- the next S3 page starts after this page is enqueued.
      await enqueueOrRetry(jobs, failedJobs)
    }
    enqueued += jobs.length
    continuationToken = page.nextContinuationToken
    if (!continuationToken) return { enqueued, hasMore: false }
  }
  await enqueueContinuation(continuationToken!)
  return { enqueued, hasMore: true }
}
