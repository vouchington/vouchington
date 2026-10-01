import { createEnqueueFunction, createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { emails } from '../queues.mts'
import { QUEUE_NAME, PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from '../config.mts'

const enqueueReminders = createBulkEnqueueFunction<string, { apiKeyId: string }, string>({
  queue: emails,
  queueName: QUEUE_NAME,
  jobName: 'processSendApiKeyExpiryReminder',
  buildJob: apiKeyId => ({
    data: { apiKeyId },
    opts: {
      deduplication: { id: `api-key-expiry:${apiKeyId}`, mode: 'throttle', ttl: 60_000 },
    },
  }),
})
const enqueueDispatcher = createEnqueueFunction({
  queue: emails,
  queueName: QUEUE_NAME,
  jobName: 'dispatchApiKeyExpiryReminders',
})
const options = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}

export function enqueueBulkSendApiKeyExpiryReminders(apiKeyIds: string[]) {
  return enqueueReminders(apiKeyIds, {
    ...options,
    priority: PRIORITY_DEFAULT,
  })
}

export function enqueueDispatchApiKeyExpiryReminders() {
  return enqueueDispatcher(
    {},
    {
      ...options,
      priority: PRIORITY_DISPATCHER,
      deduplication: { id: 'api-key-expiry-dispatch', mode: 'throttle', ttl: 60_000 },
    },
  )
}
