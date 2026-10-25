import { SQSClient } from '@modules/aws'
import { recordSqsConsumerConfigMissing } from '@modules/on-error'
import {
  createSqsClientPort,
  createSqsConsumer,
  type SqsConsumer,
} from '@vouchington/worker-runtime/sqs'
import { processSesBounceSqsMessage } from './processors.mts'

const QUEUE_NAME = 'ses-bounce-sqs'

export async function loadSesBounceSqs(): Promise<SqsConsumer | null> {
  const queueUrl = process.env.SES_BOUNCE_SQS_QUEUE_URL
  if (!queueUrl) {
    recordSqsConsumerConfigMissing(QUEUE_NAME, 'SES_BOUNCE_SQS_QUEUE_URL')
    return null
  }
  return createSqsConsumer({
    name: QUEUE_NAME,
    handleMessage: processSesBounceSqsMessage,
    port: createSqsClientPort(SQSClient, queueUrl),
  })
}
