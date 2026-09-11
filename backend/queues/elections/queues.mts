import { createQueue } from '@data-stores/valkey-glide-mq'
import type { ElectionsJobData } from './types.mts'
import { QUEUE_NAME } from './config.mts'

export const elections = createQueue<ElectionsJobData['data']>(QUEUE_NAME)
