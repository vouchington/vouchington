import { UnrecoverableError } from '@modules/queue-errors'
import { enqueueOrRetryBulkSesInboundProcess } from '@queues/ses-inbound/enqueues'
import { enqueueOrRetryBulkCustomerSupport } from '@queues/ai-agents/enqueues/customer-support'
import {
  createInboundSupportEmailMessage,
  isInboundSupportEmailComplete,
  listInboundCustomerSupportRecoveryCandidates,
} from '@services/customer-support'
import {
  assertSesInboundProcessJobData,
  getSesMessageIdFromObjectKey,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import { parseSesInboundMime, SesInboundTerminalError } from './processors/mime.mts'
import {
  deleteSesInboundObject,
  listSesInboundObjects,
  loadSesInboundObject,
  moveSesInboundObjectToFailed,
  type SesInboundObjectPage,
} from './processors/s3.mts'

type ProcessDependencies = {
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
  listSesInboundObjects: (continuationToken?: string) => Promise<SesInboundObjectPage>
}

export async function processSesInboundEmail(
  data: SesInboundProcessJobData,
  dependencies?: Partial<ProcessDependencies>,
): Promise<void> {
  assertSesInboundProcessJobData(data)
  const deps = {
    createInboundSupportEmailMessage,
    deleteSesInboundObject,
    isInboundSupportEmailComplete,
    loadSesInboundObject,
    moveSesInboundObjectToFailed,
    parseSesInboundMime,
    ...dependencies,
  }

  if (await deps.isInboundSupportEmailComplete(data.sesMessageId)) {
    await deps.deleteSesInboundObject(data.objectKey)
    return
  }

  try {
    await persistSesInboundEmail(data, deps)
    await deps.deleteSesInboundObject(data.objectKey)
  } catch (error) {
    if (!(error instanceof SesInboundTerminalError)) throw error
    await deps.moveSesInboundObjectToFailed(data.objectKey, data.sesMessageId)
    throw new UnrecoverableError(error.message)
  }
}

export async function reconcileSesInboundEmails(
  dependencies?: Partial<ReconcileDependencies>,
): Promise<{ enqueued: number; customerSupportEnqueued: number }> {
  const listObjects = dependencies?.listSesInboundObjects ?? listSesInboundObjects
  const enqueueOrRetry =
    dependencies?.enqueueOrRetryBulkSesInboundProcess ?? enqueueOrRetryBulkSesInboundProcess
  const listCustomerSupportCandidates =
    dependencies?.listInboundCustomerSupportRecoveryCandidates ??
    listInboundCustomerSupportRecoveryCandidates
  const enqueueOrRetryCustomerSupport =
    dependencies?.enqueueOrRetryBulkCustomerSupport ?? enqueueOrRetryBulkCustomerSupport
  let continuationToken: string | undefined
  let enqueued = 0

  do {
    // oxlint-disable-next-line no-await-in-loop -- each S3 page supplies the next continuation token.
    const page = await listObjects(continuationToken)
    const jobs = page.objectKeys.map(objectKey => ({
      sesMessageId: getSesMessageIdFromObjectKey(objectKey),
      objectKey,
    }))
    // oxlint-disable-next-line no-await-in-loop -- the durable scan cursor advances only after this page is enqueued.
    await enqueueOrRetry(jobs)
    enqueued += jobs.length
    continuationToken = page.nextContinuationToken
  } while (continuationToken)

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

async function persistSesInboundEmail(
  data: SesInboundProcessJobData,
  dependencies: ProcessDependencies,
): Promise<void> {
  const email = await loadAndParseSesInboundEmail(data.objectKey, dependencies)
  await dependencies.createInboundSupportEmailMessage({
    sesMessageId: data.sesMessageId,
    s3ObjectKey: data.objectKey,
    ...email,
    emailTo: process.env.SUPPORT_EMAIL_ADDRESS ?? 'support@voucha.ai',
  })
}

async function loadAndParseSesInboundEmail(
  objectKey: string,
  dependencies: ProcessDependencies,
): ReturnType<ProcessDependencies['parseSesInboundMime']> {
  return dependencies.parseSesInboundMime(await dependencies.loadSesInboundObject(objectKey))
}
