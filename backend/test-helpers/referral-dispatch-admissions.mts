import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '../data-stores/valkey-glide-mq/glide-mq-admission.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '../queues/background-cpu/config.mts'
import { backgroundCpu } from '../queues/background-cpu/queues.mts'
import { readEnqueuedJob } from './queue-jobs.mts'

type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown }
type Receipt = { event: EnqueueAdmission; outcome: Promise<Outcome> }
type PersistedJob = { name: string; data: unknown }

type AdmissionReads = {
  crawlJobs: (linkId: string) => Promise<PersistedJob[]>
  dispatcherJobs: (urlId: string) => Promise<PersistedJob[]>
}

/** Capture only owned real-queue admissions and read persisted jobs by their returned IDs. */
export async function withOwnedReferralDispatchAdmissions<T>(
  owned: { linkIds: readonly string[]; urlId?: string },
  action: (reads: AdmissionReads) => Promise<T>,
): Promise<T> {
  const linkIds = new Set(owned.linkIds)
  const receipts: Receipt[] = []
  const detach = onEnqueueAdmission(event => {
    if (
      event.queue !== backgroundCpu ||
      event.queueName !== BACKGROUND_CPU_QUEUE_NAME ||
      !event.inputs.some(input => ownsInput(event.jobName, input, linkIds, owned.urlId))
    )
      return undefined
    receipts.push({
      event,
      outcome: event.completion.then(
        value => ({ ok: true, value }),
        (err: unknown) => ({ ok: false, error: err }),
      ),
    })
    return undefined
  })
  let value: T | undefined
  let actionError: unknown
  let actionFailed = false
  try {
    value = await action({
      crawlJobs: linkId => readOwnedJobs(receipts, 'crawl.crawl_referral_link', 'linkId', linkId),
      dispatcherJobs: urlId =>
        readOwnedJobs(receipts, 'crawl.crawl_referral_links_dispatcher', 'urlId', urlId),
    })
  } catch (err) {
    actionError = err
    actionFailed = true
  }
  const errors: unknown[] = []
  try {
    detach()
  } catch (err) {
    errors.push(err)
  }
  for (const receipt of receipts) {
    const outcome = await receipt.outcome
    if (!outcome.ok) errors.push(outcome.error)
    errors.push(...receipt.event.observerErrors, ...receipt.event.reportingErrors)
  }
  if (errors.length)
    throw new AggregateError(
      actionFailed ? [actionError, ...errors] : errors,
      'Referral admission failed',
      {
        cause: actionFailed ? actionError : errors[0],
      },
    )
  if (actionFailed) throw actionError
  return value!
}

function ownsInput(
  name: string,
  input: unknown,
  linkIds: ReadonlySet<string>,
  urlId: string | undefined,
): boolean {
  if (typeof input !== 'object' || input === null) return false
  if (name === 'crawl.crawl_referral_link')
    return 'linkId' in input && typeof input.linkId === 'string' && linkIds.has(input.linkId)
  return (
    name === 'crawl.crawl_referral_links_dispatcher' &&
    urlId !== undefined &&
    'urlId' in input &&
    input.urlId === urlId
  )
}

async function readOwnedJobs(
  receipts: readonly Receipt[],
  name: string,
  key: 'linkId' | 'urlId',
  expected: string,
): Promise<PersistedJob[]> {
  const jobs: PersistedJob[] = []
  for (const receipt of receipts) {
    if (receipt.event.jobName !== name) continue
    const outcome = await receipt.outcome
    if (!outcome.ok) throw outcome.error
    for (const enqueued of Array.isArray(outcome.value) ? outcome.value : [outcome.value]) {
      const job = await readEnqueuedJob(backgroundCpu, enqueued)
      if (
        job.name === name &&
        typeof job.data === 'object' &&
        job.data !== null &&
        Object.hasOwn(job.data, key) &&
        Reflect.get(job.data, key) === expected
      )
        jobs.push({ name: job.name, data: job.data })
    }
  }
  return jobs
}
