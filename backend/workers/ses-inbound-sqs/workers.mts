import { SQSClient } from '@modules/aws'
import { recordSqsConsumerConfigMissing } from '@modules/on-error'
import {
  createSqsClientPort,
  createSqsConsumer,
  type SqsConsumer,
} from '@vouchington/worker-runtime/sqs'
import { processSesInboundSqsMessage } from './processors.mts'

const QUEUE_NAME = 'ses-inbound-sqs'

export async function loadSesInboundSqs(): Promise<SqsConsumer | null> {
  const queueUrl = process.env.SES_INBOUND_SQS_QUEUE_URL
  if (!queueUrl) {
    recordSqsConsumerConfigMissing(QUEUE_NAME, 'SES_INBOUND_SQS_QUEUE_URL')
    return null
  }
  return createSqsConsumer({
    name: QUEUE_NAME,
    handleMessage: processSesInboundSqsMessage,
    port: createSqsClientPort(SQSClient, queueUrl),
  })
}
