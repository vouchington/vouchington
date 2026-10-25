import { createQueue } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_CPU_QUEUE_NAME, getBackgroundCpuOrderingConcurrency } from './config.mts'

export const backgroundCpu = createQueue(BACKGROUND_CPU_QUEUE_NAME, {
  priorityKind: 'ranked',
  orderingConcurrency: getBackgroundCpuOrderingConcurrency,
})
