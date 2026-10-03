import type { JobOptions } from 'glide-mq'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import onError from '@modules/on-error'
import { SPEND_CAP_RECHECK_JOB_NAME, SPEND_CAP_RECHECKS_QUEUE_NAME } from '../config.mts'
import { spendCapRechecks } from '../queues.mts'
import type { SpendCapRecheckJobData } from '../types.mts'

export const SPEND_CAP_RECHECK_MAX_ATTEMPTS = 2_880
export const SPEND_CAP_RECHECK_RETRY_DELAY_MS = 60_000

const defaults = {
  attempts: SPEND_CAP_RECHECK_MAX_ATTEMPTS,
  backoff: { type: 'fixed' as const, delay: SPEND_CAP_RECHECK_RETRY_DELAY_MS, jitter: 0 },
  removeOnComplete: true,
  removeOnFail: true,
  priority: 0,
} satisfies Partial<JobOptions>

const enqueueRecheck = createEnqueueFunction<SpendCapRecheckJobData, 'recheck'>({
  queue: spendCapRechecks,
  queueName: SPEND_CAP_RECHECKS_QUEUE_NAME,
  jobName: SPEND_CAP_RECHECK_JOB_NAME,
  defaults,
})

export function enqueueSpendCapRecheck(
  day: string,
  generation: string,
  delayMs: number,
): ReturnType<typeof enqueueRecheck> {
  return enqueueRecheck(
    { day, generation },
    {
      delay: delayMs,
      deduplication: {
        id: spendCapRecheckDeduplicationId(day, generation),
        mode: 'simple',
      },
    },
  )
}

export async function enqueueSpendCapRecheckBestEffort(
  day: string,
  generation: string,
  delayMs: number,
  enqueue: typeof enqueueSpendCapRecheck = enqueueSpendCapRecheck,
): Promise<void> {
  let enqueued: ReturnType<typeof enqueueSpendCapRecheck>
  try {
    enqueued = enqueue(day, generation, delayMs)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err), { cause: err }))
    return
  }
  await enqueued.then(() => undefined, onError)
}

export function spendCapRecheckDeduplicationId(day: string, generation: string): string {
  return `ai-spend-cap-recheck_${day}_${generation}`
}
