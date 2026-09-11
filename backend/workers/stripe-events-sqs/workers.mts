import { createSqsConsumer, type SqsConsumer } from '@backend/worker-runtime'
import { recordSqsConsumerConfigMissing } from '@modules/on-error'
import { processStripeEventsSqsMessage } from './processors.mts'

const QUEUE_NAME = 'stripe-events-sqs'

// The queue and its ECS task env var (vouchington-infra/opentofu/sqs-event-ingress.tf, vouchington-infra/opentofu/ecs-worker.tf) exist
// as of this PR, but nothing delivers to it yet -- Phase 4a's spike gates the EventBridge rule/target
// that would (see README.md). Read the URL lazily so a missing value (e.g. local dev without the var
// set) reports a gap instead of throwing at module-eval time and taking down every other
// worker-io/worker-cpu queue with it (same reasoning as loadBedrockBatchSqs).
export async function loadStripeEventsSqs(): Promise<SqsConsumer | null> {
  const queueUrl = process.env.STRIPE_EVENTS_SQS_QUEUE_URL
  if (!queueUrl) {
    recordSqsConsumerConfigMissing(QUEUE_NAME, 'STRIPE_EVENTS_SQS_QUEUE_URL')
    return null
  }

  return createSqsConsumer({
    name: QUEUE_NAME,
    queueUrl,
    handleMessage: processStripeEventsSqsMessage,
  })
}
