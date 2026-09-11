import { createSqsConsumer, type SqsConsumer } from '@backend/worker-runtime'
import { recordSqsConsumerConfigMissing } from '@modules/on-error'
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
    queueUrl,
    handleMessage: processSesInboundSqsMessage,
  })
}
