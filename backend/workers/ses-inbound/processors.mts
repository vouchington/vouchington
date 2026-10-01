import { recordScheduledJobConfigMissing } from '@modules/on-error'
import { UnrecoverableError } from '@modules/queue-errors'
import { enqueueOrRetryBulkSesInboundProcess } from '@queues/ses-inbound/enqueues'
import { enqueueCopyrightEmailIntakeAndWait } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'
import {
  assertSesInboundProcessJobData,
  getSesInboundKindFromObjectKey,
  getSesMessageIdFromObjectKey,
  SES_INBOUND_RECONCILE_JOB_NAME,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import { parseSesInboundMime, SesInboundTerminalError } from './processors/mime.mts'
import {
  processCopyrightInboundEmail,
  type CopyrightEmailDependencies,
  type CopyrightSesInboundProcessJobData,
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
  listCopyrightSesInboundObjects: (continuationToken?: string) => Promise<SesInboundObjectPage>
}

export async function processSesInboundEmail(
  data: SesInboundProcessJobData,
  dependencies?: Partial<ProcessDependencies>,
): Promise<void> {
  assertSesInboundProcessJobData(data)
  assertCopyrightSesInboundJob(data)
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
  dependencies?: Partial<ReconcileDependencies>,
): Promise<{ enqueued: number }> {
  // The sweep has nothing to scan without the bucket. Skip loudly (local dev has none) instead of
  // throwing, which would be retried and logged as an error every five minutes. Ingest of a real
  // email still fails on a missing bucket because that job only exists once mail arrived.
  if (!readSesInboundBucket()) {
    recordScheduledJobConfigMissing(SES_INBOUND_RECONCILE_JOB_NAME, 'S3_BUCKET_SES_INBOUND')
    return { enqueued: 0 }
  }
  const listCopyrightObjects =
    dependencies?.listCopyrightSesInboundObjects ?? listCopyrightSesInboundObjects
  const enqueueOrRetry =
    dependencies?.enqueueOrRetryBulkSesInboundProcess ?? enqueueOrRetryBulkSesInboundProcess
  return { enqueued: await enqueueAllInboundPages(listCopyrightObjects, enqueueOrRetry) }
}

async function enqueueAllInboundPages(
  listObjects: (continuationToken?: string) => Promise<SesInboundObjectPage>,
  enqueueOrRetry: typeof enqueueOrRetryBulkSesInboundProcess,
): Promise<number> {
  let continuationToken: string | undefined
  let enqueued = 0
  do {
    // oxlint-disable-next-line no-await-in-loop -- each S3 page supplies the next continuation token.
    const page = await listObjects(continuationToken)
    const jobs = page.objectKeys.map(objectKey => ({
      sesMessageId: getSesMessageIdFromObjectKey(objectKey),
      objectKey,
      intakeKind: getSesInboundKindFromObjectKey(objectKey),
    }))
    if (jobs.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- the durable scan cursor advances only after this page is enqueued.
      await enqueueOrRetry(jobs)
    }
    enqueued += jobs.length
    continuationToken = page.nextContinuationToken
  } while (continuationToken)
  return enqueued
}

// Support intake is retired (#375), so this worker only handles copyright jobs. Reject any other
// kind before any dependency call. Leave its source object where it is: moving it to `failed/`
// deletes the original, and `failed/` expires after 30 days.
function assertCopyrightSesInboundJob(
  data: SesInboundProcessJobData,
): asserts data is CopyrightSesInboundProcessJobData {
  if (data.intakeKind === 'copyright') return
  throw new UnrecoverableError(
    `SES inbound intake kind ${data.intakeKind} is not processed; its source object is left in place`,
  )
}
