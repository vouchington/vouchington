import type { SqsConsumerDefinition } from '@vouchington/worker-runtime/sqs'

export const SQS_CONSUMER_DEFINITIONS = [
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
