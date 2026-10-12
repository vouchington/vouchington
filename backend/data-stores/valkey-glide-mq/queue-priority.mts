import type { JobOptions } from 'glide-mq'

export type QueuePriorityKind = 'none' | 'ranked'

export function assertQueuePriority(
  queueName: string,
  kind: QueuePriorityKind,
  priority: number,
): void {
  if (
    !Number.isInteger(priority) ||
    priority < 0 ||
    priority > 2048 ||
    (kind === 'none' ? priority !== 0 : priority === 0)
  ) {
    throw new RangeError(
      `${queueName} accepts only ${kind === 'none' ? 'priority 0' : 'priority 1..2048'}`,
    )
  }
}

export function checkedPriorityOptions(
  queueName: string,
  kind: QueuePriorityKind,
  options?: JobOptions,
): JobOptions {
  const priority = options?.priority ?? (kind === 'none' ? 0 : 10)
  assertQueuePriority(queueName, kind, priority)
  return { ...options, priority }
}
