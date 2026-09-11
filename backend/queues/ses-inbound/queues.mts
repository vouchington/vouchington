import { createQueue } from '@data-stores/valkey-glide-mq'
import type { SesInboundProcessJobData } from '@ts-shared/ses-inbound-contract'
import { SES_INBOUND_QUEUE_NAME } from './config.mts'

export const sesInboundQueue = createQueue<SesInboundProcessJobData | Record<string, never>>(
  SES_INBOUND_QUEUE_NAME,
)
