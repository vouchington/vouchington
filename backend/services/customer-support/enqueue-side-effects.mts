import onError from '@modules/on-error'
import { enqueueEmbedSupportMessage } from '@queues/customer-support/enqueues'

const enqueueEmbedSupportMessageUnknown: (threadId: string, messageId: string) => unknown =
  enqueueEmbedSupportMessage

export function enqueueSupportMessageEmbedding(threadId: string, messageId: string): void {
  runSupportEnqueue(() => enqueueEmbedSupportMessageUnknown(threadId, messageId))
}

function runSupportEnqueue(effect: () => unknown): void {
  const result = effect()
  if (isPromiseLike(result)) void result.catch(onError)
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as { catch?: unknown }).catch === 'function'
  )
}
