import { randomUUID } from 'node:crypto'
import { onTestFinished, vi } from 'vitest'
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'

// Reads the endpoint and keys that `vitest.setup.aws-emulator.mts` exported, independently of the
// application's SQS client, so a test can seed and inspect queues without the code under test.
let client: SQSClient | undefined

export function emulatorSqs(): SQSClient {
  // The queue URL carries the real AWS host; the explicit endpoint keeps requests on the emulator.
  client ??= new SQSClient({
    region: process.env.AWS_REGION ?? 'us-west-2',
    useQueueUrlAsEndpoint: false,
  })
  return client
}

/** A queue owned by one test file, for workers that read their queue URL from the environment. */
export async function createTestSqsQueue(label: string): Promise<string> {
  const { QueueUrl } = await emulatorSqs().send(
    new CreateQueueCommand({ QueueName: `test-${label}-${randomUUID()}`.slice(0, 80) }),
  )
  if (!QueueUrl) throw new Error('The AWS Emulator returned no queue URL')
  return QueueUrl
}

export async function sendTestSqsMessage(QueueUrl: string, MessageBody: string): Promise<void> {
  await emulatorSqs().send(new SendMessageCommand({ QueueUrl, MessageBody }))
}

/** Messages neither visible nor in flight are gone; the sum is what a consumer has not deleted. */
export async function countTestSqsMessages(QueueUrl: string): Promise<number> {
  const { Attributes } = await emulatorSqs().send(
    new GetQueueAttributesCommand({
      QueueUrl,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
    }),
  )
  return (
    Number(Attributes?.ApproximateNumberOfMessages ?? 0) +
    Number(Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0)
  )
}

/**
 * A queue owned by this test whose URL is exported through `envName`, which the worker reads when
 * it loads.
 */
export async function useTestSqsQueue(envName: string, label: string): Promise<string> {
  const queueUrl = await createTestSqsQueue(label)
  vi.stubEnv(envName, queueUrl)
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  return queueUrl
}
