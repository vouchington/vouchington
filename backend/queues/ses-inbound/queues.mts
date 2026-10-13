import { createQueue } from '@data-stores/valkey-glide-mq'
import type {
  SesInboundProcessJobData,
  SesInboundReconcileJobData,
} from '@ts-shared/ses-inbound-contract'
import { SES_INBOUND_QUEUE_NAME } from './config.mts'

export const sesInboundQueue = createQueue<SesInboundProcessJobData | SesInboundReconcileJobData>(
  SES_INBOUND_QUEUE_NAME,
)
