import type { SqsConsumerDefinition } from '@backend/worker-runtime'
import { SQS_CONSUMER_DEFINITIONS as IO_SQS_CONSUMER_DEFINITIONS } from '@entrypoints/worker-io/sqs-consumer-definitions'

// worker-queue-policy.json's "merged" profile deploys only worker-cpu, so this must carry every
// SQS consumer definition (not just CPU-bound ones) or the io-capable ones ship as dead code.
export const SQS_CONSUMER_DEFINITIONS: SqsConsumerDefinition[] = [...IO_SQS_CONSUMER_DEFINITIONS]
