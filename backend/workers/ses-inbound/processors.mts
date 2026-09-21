import { UnrecoverableError } from '@modules/queue-errors'
import { enqueueOrRetryBulkSesInboundProcess } from '@queues/ses-inbound/enqueues'
import { enqueueOrRetryBulkCustomerSupport } from '@queues/ai-agents/enqueues/customer-support'
import { enqueueCopyrightEmailIntakeAndWait } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'
import {
  createInboundSupportEmailMessage,
  isInboundSupportEmailComplete,
  listInboundCustomerSupportRecoveryCandidates,
} from '@services/customer-support'
import {
  assertSesInboundProcessJobData,
  getSesInboundKindFromObjectKey,
  getSesMessageIdFromObjectKey,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import { parseSesInboundMime, SesInboundTerminalError } from './processors/mime.mts'
import { persistSesInboundEmail } from './processors/support.mts'
import {
  processCopyrightInboundEmail,
  type CopyrightEmailDependencies,
} from './processors/copyright-email.mts'
import {
  deleteSesInboundObject,
  copySesInboundObjectToCopyrightEvidence,
  listCopyrightSesInboundObjects,
  listSesInboundObjects,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
  loadSesInboundObject,
  moveSesInboundObjectToFailed,
  type SesInboundObjectPage,
} from './processors/s3.mts'

type ProcessDependencies = CopyrightEmailDependencies & {
  createInboundSupportEmailMessage: typeof createInboundSupportEmailMessage
  deleteSesInboundObject: typeof deleteSesInboundObject
  isInboundSupportEmailComplete: typeof isInboundSupportEmailComplete
  loadSesInboundObject: typeof loadSesInboundObject
  moveSesInboundObjectToFailed: typeof moveSesInboundObjectToFailed
  parseSesInboundMime: typeof parseSesInboundMime
}

type ReconcileDependencies = {
  enqueueOrRetryBulkCustomerSupport: typeof enqueueOrRetryBulkCustomerSupport
  enqueueOrRetryBulkSesInboundProcess: typeof enqueueOrRetryBulkSesInboundProcess
  listInboundCustomerSupportRecoveryCandidates: typeof listInboundCustomerSupportRecoveryCandidates
  listCopyrightSesInboundObjects: (continuationToken?: string) => Promise<SesInboundObjectPage>
  listSesInboundObjects: (continuationToken?: string) => Promise<SesInboundObjectPage>
}

export async function processSesInboundEmail(
  data: SesInboundProcessJobData,
  dependencies?: Partial<ProcessDependencies>,
): Promise<void> {
  assertSesInboundProcessJobData(data)
  const deps = {
    copySesInboundObjectToCopyrightEvidence,
    createCopyrightEmailIntake,
    createInboundSupportEmailMessage,
    deleteSesInboundObject,
    enqueueCopyrightEmailIntakeAndWait,
    isInboundSupportEmailComplete,
    loadSesInboundObject,
    loadSesInboundObjectAndHash,
    loadSesInboundObjectVersion,
    moveSesInboundObjectToFailed,
    parseSesInboundMime,
    recordCopyrightEmailParse,
    ...dependencies,
  }

  if (
    data.intakeKind === 'support' &&
    (await deps.isInboundSupportEmailComplete(data.sesMessageId))
  ) {
    await deps.deleteSesInboundObject(data.objectKey)
    return
  }

  try {
    if (data.intakeKind === 'copyright') {
      await processCopyrightInboundEmail(data, deps)
      await deps.deleteSesInboundObject(data.objectKey)
      return
    }
    await processSupportInboundEmail(data, deps)
  } catch (error) {
    if (!(error instanceof SesInboundTerminalError)) throw error
    await deps.moveSesInboundObjectToFailed(data.objectKey, data.sesMessageId)
    throw new UnrecoverableError(error.message)
  }
}

async function processSupportInboundEmail(
  data: SesInboundProcessJobData,
  dependencies: ProcessDependencies,
): Promise<void> {
  await loadAndPersistSupportInboundEmail(data, dependencies)
  await dependencies.deleteSesInboundObject(data.objectKey)
}

async function loadAndPersistSupportInboundEmail(
  data: SesInboundProcessJobData,
  dependencies: ProcessDependencies,
): Promise<void> {
  const email = await loadAndParseSesInboundEmail(data.objectKey, dependencies)
  await persistSesInboundEmail(data, email, dependencies.createInboundSupportEmailMessage)
}

export async function reconcileSesInboundEmails(
  dependencies?: Partial<ReconcileDependencies>,
): Promise<{ enqueued: number; customerSupportEnqueued: number }> {
  const listObjects = dependencies?.listSesInboundObjects ?? listSesInboundObjects
  const listCopyrightObjects =
    dependencies?.listCopyrightSesInboundObjects ?? listCopyrightSesInboundObjects
  const enqueueOrRetry =
    dependencies?.enqueueOrRetryBulkSesInboundProcess ?? enqueueOrRetryBulkSesInboundProcess
  const listCustomerSupportCandidates =
    dependencies?.listInboundCustomerSupportRecoveryCandidates ??
    listInboundCustomerSupportRecoveryCandidates
  const enqueueOrRetryCustomerSupport =
    dependencies?.enqueueOrRetryBulkCustomerSupport ?? enqueueOrRetryBulkCustomerSupport
  const [supportEnqueued, copyrightEnqueued] = await Promise.all([
    enqueueAllInboundPages(listObjects, enqueueOrRetry),
    enqueueAllInboundPages(listCopyrightObjects, enqueueOrRetry),
  ])
  const enqueued = supportEnqueued + copyrightEnqueued

  let customerSupportCursor: string | undefined
  let customerSupportEnqueued = 0
  do {
    // oxlint-disable-next-line no-await-in-loop -- each PostgreSQL page supplies the next cursor.
    const page = await listCustomerSupportCandidates({
      ...(customerSupportCursor ? { after: customerSupportCursor } : {}),
    })
    // oxlint-disable-next-line no-await-in-loop -- advance the scan cursor only after awaited fan-out.
    await enqueueOrRetryCustomerSupport(page.results)
    customerSupportEnqueued += page.results.length
    customerSupportCursor = page.page_info.end_cursor ?? undefined
  } while (customerSupportCursor)

  return { enqueued, customerSupportEnqueued }
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

async function loadAndParseSesInboundEmail(
  objectKey: string,
  dependencies: ProcessDependencies,
): ReturnType<ProcessDependencies['parseSesInboundMime']> {
  return dependencies.parseSesInboundMime(await dependencies.loadSesInboundObject(objectKey))
}
