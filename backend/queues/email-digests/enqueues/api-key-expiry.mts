import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB,
  EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB,
} from '@queues/background/enqueues/email-digests-jobs'
import { API_KEY_EXPIRY_DEDUP_TTL_MS } from '../config.mts'

export const enqueueBulkSendApiKeyExpiryReminders = createBackgroundBulkEnqueue(
  EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB,
  (apiKeyId: string) => ({
    data: { apiKeyId },
    opts: {
      deduplication: {
        id: `email-digests:api-key-expiry:${apiKeyId}`,
        mode: 'throttle',
        ttl: API_KEY_EXPIRY_DEDUP_TTL_MS,
      },
    },
  }),
)
const enqueueDispatcher = createBackgroundEnqueue(EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB)

export function enqueueDispatchApiKeyExpiryReminders(data: { afterId?: string } = {}) {
  return enqueueDispatcher(data, {
    deduplication: {
      id: `email-digests:api-key-expiry-dispatch:${data.afterId ?? 'root'}`,
      mode: 'throttle',
      ttl: API_KEY_EXPIRY_DEDUP_TTL_MS,
    },
  })
}
