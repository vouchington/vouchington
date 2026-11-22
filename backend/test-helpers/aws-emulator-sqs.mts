import { vi } from 'vitest'
import { SQSClient } from '@aws-sdk/client-sqs'
import {
  countTestSqsMessages as countMessages,
  createTestSqsQueue as createQueue,
  sendTestSqsMessage as sendMessage,
} from '@vouchington/aws/testing'

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

export const createTestSqsQueue = (label: string) => createQueue(emulatorSqs(), label)

export const sendTestSqsMessage = (QueueUrl: string, MessageBody: string) =>
  sendMessage(emulatorSqs(), QueueUrl, MessageBody)

export const countTestSqsMessages = (QueueUrl: string) => countMessages(emulatorSqs(), QueueUrl)

/**
 * A queue owned by this test whose URL is exported through `envName`, which the worker reads when
 * it loads. The caller's suite unstubs environment variables after each test.
 */
export async function useTestSqsQueue(envName: string, label: string): Promise<string> {
  const queueUrl = await createTestSqsQueue(label)
  vi.stubEnv(envName, queueUrl)
  return queueUrl
}
