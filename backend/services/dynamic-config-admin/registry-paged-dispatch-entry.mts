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
      key === 'engagement_page_size'
        ? 'Raw engagement candidate rows scanned by one continuation, including excluded recipients.'
        : key.endsWith('_page_size')
          ? 'Rows admitted by one dispatcher page.'
          : key.endsWith('_backoff_ms')
            ? 'Maximum retry and queue-capacity delay in milliseconds.'
            : 'Whole target queue waiting, active and delayed depth limit.',
    ]),
  ),
})
