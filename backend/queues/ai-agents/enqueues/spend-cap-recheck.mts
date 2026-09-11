import type { JobOptions } from 'glide-mq'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import onError from '@modules/on-error'
import {
  OPENAI_SPEND_CAP_RECHECK_JOB_NAME,
  OPENAI_SPEND_CAP_RECHECKS_QUEUE_NAME,
} from '../config.mts'
import { openAiSpendCapRechecks } from '../queues.mts'
import type { OpenAiSpendCapRecheckJobData } from '../types.mts'

export const OPENAI_SPEND_CAP_RECHECK_MAX_ATTEMPTS = 2_880
export const OPENAI_SPEND_CAP_RECHECK_RETRY_DELAY_MS = 60_000

const defaults = {
  attempts: OPENAI_SPEND_CAP_RECHECK_MAX_ATTEMPTS,
  backoff: { type: 'fixed' as const, delay: OPENAI_SPEND_CAP_RECHECK_RETRY_DELAY_MS, jitter: 0 },
  removeOnComplete: true,
  removeOnFail: true,
  priority: 0,
} satisfies Partial<JobOptions>

const enqueueRecheck = createEnqueueFunction<OpenAiSpendCapRecheckJobData, 'recheck'>({
  queue: openAiSpendCapRechecks,
  queueName: OPENAI_SPEND_CAP_RECHECKS_QUEUE_NAME,
  jobName: OPENAI_SPEND_CAP_RECHECK_JOB_NAME,
  defaults,
})

export function enqueueOpenAiSpendCapRecheck(
  day: string,
  generation: string,
  delayMs: number,
): ReturnType<typeof enqueueRecheck> {
  return enqueueRecheck(
    { day, generation },
    {
      delay: delayMs,
      deduplication: {
        id: openAiSpendCapRecheckDeduplicationId(day, generation),
        mode: 'simple',
      },
    },
  )
}

export async function enqueueOpenAiSpendCapRecheckBestEffort(
  day: string,
  generation: string,
  delayMs: number,
  enqueue: typeof enqueueOpenAiSpendCapRecheck = enqueueOpenAiSpendCapRecheck,
): Promise<void> {
  let enqueued: ReturnType<typeof enqueueOpenAiSpendCapRecheck>
  try {
    enqueued = enqueue(day, generation, delayMs)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error), { cause: error }))
    return
  }
  await enqueued.then(
    () => undefined,
    () => undefined,
  )
}

export function openAiSpendCapRecheckDeduplicationId(day: string, generation: string): string {
  return `openai-spend-cap-recheck_${day}_${generation}`
}
