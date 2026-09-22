import { UnrecoverableError } from '@modules/queue-errors'
import { enqueueOrRetryBulkSesInboundProcess } from '@queues/ses-inbound/enqueues'
import { enqueueCopyrightEmailIntakeAndWait } from '@queues/ai-agents/enqueues/copyright-email-intake'
import {
  createCopyrightEmailIntake,
  isCopyrightIntakeEnabled,
  recordCopyrightEmailParse,
} from '@services/copyright-notices'
import {
  assertSesInboundProcessJobData,
  getSesInboundKindFromObjectKey,
  getSesMessageIdFromObjectKey,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
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
  type SesInboundObjectPage,
} from './processors/s3.mts'

type ProcessDependencies = CopyrightEmailDependencies & {
  deleteSesInboundObject: typeof deleteSesInboundObject
  isCopyrightIntakeEnabled: typeof isCopyrightIntakeEnabled
  loadSesInboundObject: typeof loadSesInboundObject
  moveSesInboundObjectToFailed: typeof moveSesInboundObjectToFailed
  parseSesInboundMime: typeof parseSesInboundMime
}

type ReconcileDependencies = {
  enqueueOrRetryBulkSesInboundProcess: typeof enqueueOrRetryBulkSesInboundProcess
  isCopyrightIntakeEnabled: typeof isCopyrightIntakeEnabled
  listCopyrightSesInboundObjects: (continuationToken?: string) => Promise<SesInboundObjectPage>
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
    isCopyrightIntakeEnabled,
    loadSesInboundObject,
    loadSesInboundObjectAndHash,
    loadSesInboundObjectVersion,
    moveSesInboundObjectToFailed,
    parseSesInboundMime,
    recordCopyrightEmailParse,
    ...dependencies,
  }

  try {
    if (!deps.isCopyrightIntakeEnabled()) return
    await processCopyrightInboundEmail(data, deps)
    await deps.deleteSesInboundObject(data.objectKey)
  } catch (error) {
    if (!(error instanceof SesInboundTerminalError)) throw error
    await deps.moveSesInboundObjectToFailed(data.objectKey, data.sesMessageId)
    throw new UnrecoverableError(error.message)
  }
}

export async function reconcileSesInboundEmails(
  dependencies?: Partial<ReconcileDependencies>,
): Promise<{ enqueued: number }> {
  const listCopyrightObjects =
    dependencies?.listCopyrightSesInboundObjects ?? listCopyrightSesInboundObjects
  const enqueueOrRetry =
    dependencies?.enqueueOrRetryBulkSesInboundProcess ?? enqueueOrRetryBulkSesInboundProcess
  const copyrightIntakeEnabled = dependencies?.isCopyrightIntakeEnabled ?? isCopyrightIntakeEnabled
  const enqueued = copyrightIntakeEnabled()
    ? await enqueueAllInboundPages(listCopyrightObjects, enqueueOrRetry)
    : 0
  return { enqueued }
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
