import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'
import type { ReportIntegrityJobData } from './types.mts'

export const reportIntegrityQueue = createQueue<ReportIntegrityJobData['data']>(QUEUE_NAME)
