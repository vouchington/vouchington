import {
  membershipVerificationQueueConfig,
  membershipVerificationQueueMaxValues,
} from '@queues/memberships/config'
import {
  pagedDispatchConfig,
  pagedDispatchMaxValues,
} from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
export const pagedDispatchRegistryEntry = defineBoundedWorkNamespace({
  namespace: 'paged-dispatch-work-config',
  config: pagedDispatchConfig,
  label: 'Paged queue dispatch',
  maxValues: pagedDispatchMaxValues,
  descriptions: Object.fromEntries(
    Object.keys(pagedDispatchConfig.defaultFields).map(key => [
      key,
      key.endsWith('_page_size')
        ? 'Rows admitted by one dispatcher page.'
        : key.endsWith('_backoff_ms')
          ? 'Maximum retry and queue-capacity delay in milliseconds.'
          : 'Whole target queue waiting, active and delayed depth limit.',
    ]),
  ),
})

export const membershipVerificationQueueRegistryEntry = defineBoundedWorkNamespace({
  namespace: 'membership-verification-queue-config',
  config: membershipVerificationQueueConfig,
  label: 'Membership verification queue',
  maxValues: membershipVerificationQueueMaxValues,
  descriptions: {
    verification_concurrency: 'Global provider-execution concurrency for membership verifications.',
    dispatch_concurrency: 'Global concurrency for pending verification recovery pages.',
    verification_retry_minutes: 'Delay before checking a pending provider purchase again.',
  },
})
