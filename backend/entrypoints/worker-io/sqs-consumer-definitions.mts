import type { SqsConsumerDefinition } from '@backend/worker-runtime'

export const SQS_CONSUMER_DEFINITIONS = [
  {
    queueName: 'bedrock-batch-sqs',
    load: () =>
      import('@workers/bedrock-batch-sqs/workers').then(module => module.loadBedrockBatchSqs()),
  },
  {
    queueName: 'ses-bounce-sqs',
    load: () => import('@workers/ses-bounce-sqs/workers').then(module => module.loadSesBounceSqs()),
  },
  {
    queueName: 'ses-inbound-sqs',
    load: () =>
      import('@workers/ses-inbound-sqs/workers').then(module => module.loadSesInboundSqs()),
  },
  {
    queueName: 'stripe-events-sqs',
    load: () =>
      import('@workers/stripe-events-sqs/workers').then(module => module.loadStripeEventsSqs()),
  },
] satisfies SqsConsumerDefinition[]
