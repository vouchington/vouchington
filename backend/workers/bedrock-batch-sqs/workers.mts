import { createSqsConsumer, type SqsConsumer } from '@backend/worker-runtime'
import { recordSqsConsumerConfigMissing } from '@modules/on-error'
import { processBedrockBatchSqsMessage } from './processors.mts'

const QUEUE_NAME = 'bedrock-batch-sqs'

// BEDROCK_BATCH_SQS_QUEUE_URL is only provisioned in deployed environments (see
// vouchington-infra/opentofu/sqs-event-ingress.tf); local dev has no queue URL by default. This consumer is
// otherwise selected unconditionally by ./dev/tmux's generated QUEUES list (it's in
// worker-queue-policy.json's ioCapableQueues), so the URL must be read lazily here — throwing at
// module-eval time would fail loadSqsConsumers()'s Promise.all and take down every other
// worker-io/worker-cpu queue with it, not just this one.
export async function loadBedrockBatchSqs(): Promise<SqsConsumer | null> {
  const queueUrl = process.env.BEDROCK_BATCH_SQS_QUEUE_URL
  if (!queueUrl) {
    recordSqsConsumerConfigMissing(QUEUE_NAME, 'BEDROCK_BATCH_SQS_QUEUE_URL')
    return null
  }

  return createSqsConsumer({
    name: QUEUE_NAME,
    queueUrl,
    handleMessage: processBedrockBatchSqsMessage,
  })
}
