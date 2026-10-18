import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import onError from '@modules/on-error'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { SpendCapRecheckJobData } from '../types.mts'

const enqueueRecheck = createEnqueueFunction<SpendCapRecheckJobData, string>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'ai-spend-cap.recheck',
  defaults: requireBackgroundCpuJob('ai-spend-cap.recheck').options,
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
  return `ai-spend-cap:recheck:${day}:${generation}`
}
