import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqsConsumer, type SqsConsumerPort, type SqsMessage } from '@backend/worker-runtime'
import { sesInboundQueue } from '@queues/ses-inbound/queues'
import { getSesInboundProcessJobOptions } from '@ts-shared/ses-inbound-contract'
import { processSesInboundSqsMessage } from '../processors.mts'

// This file intentionally exercises real glide-mq rather than mocking it; the passthrough only
// exists because the .real-glide.mock.test.mts filename (required for backend-real-glide-mq
// project routing) trips the no-mistakes mock-file-naming rule without a vi.mock call present.
vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

const BUCKET = 'voucha-ses-inbound-test'

function s3EventMessage(records: Array<Record<string, unknown>>): SqsMessage {
  return {
    messageId: randomUUID(),
    receiptHandle: randomUUID(),
    body: JSON.stringify({ Records: records }),
  }
}

function objectCreatedRecord(objectKey: string, bucketName: string = BUCKET) {
  return {
    eventSource: 'aws:s3',
    eventName: 'ObjectCreated:Put',
    s3: { bucket: { name: bucketName }, object: { key: objectKey } },
  }
}

// Mirrors backend/worker-runtime/sqs-consumer.test.mts's createOneShotPort: the first receive()
// resolves immediately with firstBatch, every later call hangs until the abort signal fires (like
// AWS SDK's abortSignal option), then rejects like a real AbortError -- letting close() settle
// cleanly instead of tight-looping.
function createOneShotPort(firstBatch: SqsMessage[], deleteCalls: string[]): SqsConsumerPort {
  let receiveCallCount = 0
  return {
    receive: signal =>
      new Promise((resolve, reject) => {
        receiveCallCount += 1
        if (receiveCallCount === 1) {
          resolve(firstBatch)
          return
        }
        signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
      }),
    delete: async receiptHandle => {
      deleteCalls.push(receiptHandle)
    },
  }
}

describe('processSesInboundSqsMessage', () => {
  const createdJobIds: string[] = []

  beforeEach(() => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', BUCKET)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    const jobIds = createdJobIds.splice(0)
    await Promise.all(
      jobIds.map(async jobId => {
        const job = await sesInboundQueue.getJob(jobId)
        await job?.remove()
      }),
    )
  })

  it('enqueues the correctly-derived job and acks (deletes) the SQS message', async () => {
    const sesMessageId = `ses-${randomUUID()}`
    const objectKey = `incoming/${sesMessageId}`
    const jobId = getSesInboundProcessJobOptions({
      sesMessageId,
      objectKey,
      intakeKind: 'support',
    }).jobId
    createdJobIds.push(jobId)
    const message = s3EventMessage([objectCreatedRecord(objectKey)])
    const deleteCalls: string[] = []
    const port = createOneShotPort([message], deleteCalls)

    const consumer = createSqsConsumer({
      name: 'test',
      queueUrl: 'unused',
      handleMessage: processSesInboundSqsMessage,
      port,
    })
    const deleted = new Promise<SqsMessage>(resolve => consumer.once('message-deleted', resolve))
    const deletedMessage = await deleted
    await consumer.close()

    expect(deletedMessage).toEqual(message)
    expect(deleteCalls).toEqual([message.receiptHandle])
    const job = await sesInboundQueue.getJob(jobId)
    expect(job).toMatchObject({
      name: 'processInboundEmail',
      data: { sesMessageId, objectKey, intakeKind: 'support' },
    })
  })

  it('deduplicates redelivery of the same message so only one job lands', async () => {
    const sesMessageId = `ses-${randomUUID()}`
    const objectKey = `incoming/${sesMessageId}`
    const jobId = getSesInboundProcessJobOptions({
      sesMessageId,
      objectKey,
      intakeKind: 'support',
    }).jobId
    createdJobIds.push(jobId)
    const message = s3EventMessage([objectCreatedRecord(objectKey)])

    // SQS is at-least-once; simulate the same message being delivered twice. The job's jobId is a
    // deterministic hash of objectKey, and getSesInboundProcessJobOptions sets
    // deduplication: { id: jobId, mode: 'simple' }, so the second add() must resolve as a no-op
    // (not throw a duplicate-key error) for redelivery to stay safe.
    await processSesInboundSqsMessage(message)
    await expect(processSesInboundSqsMessage(message)).resolves.toBeUndefined()

    const job = await sesInboundQueue.getJob(jobId)
    expect(job).toMatchObject({ name: 'processInboundEmail', data: { sesMessageId, objectKey } })
  })

  it('throws on a malformed payload and does not delete the message, so it redelivers toward the DLQ', async () => {
    // assertSesInboundProcessJobData can never fail through this processor's own honest parsing --
    // sesMessageId is always derived from objectKey, so they can never mismatch. An empty Records
    // array is the structural failure this consumer can actually hit: still "throws, not swallows,
    // message not deleted, DLQ-routable" -- the real testable requirement.
    const message = s3EventMessage([])
    const deleteCalls: string[] = []
    const port = createOneShotPort([message], deleteCalls)

    const consumer = createSqsConsumer({
      name: 'test',
      queueUrl: 'unused',
      handleMessage: processSesInboundSqsMessage,
      port,
    })
    const failed = new Promise<[SqsMessage, unknown]>(resolve =>
      consumer.once('message-failed', (msg: SqsMessage, error: unknown) => resolve([msg, error])),
    )
    const [failedMessage, error] = await failed
    await consumer.close()

    expect(failedMessage).toEqual(message)
    expect(error).toMatchObject({ status: 422 })
    expect(deleteCalls).toEqual([])
  })

  it('throws on an unexpected S3 bucket name', async () => {
    await expect(
      processSesInboundSqsMessage(
        s3EventMessage([objectCreatedRecord('incoming/msg', 'wrong-bucket')]),
      ),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('throws when the object key is outside the incoming/ prefix, and does not delete the message', async () => {
    // Routed through the full consumer (not a direct processSesInboundSqsMessage call) so this also
    // proves assertSesInboundProcessJobData's own throw -- not just this processor's S3-shape
    // asserts above it -- leaves the message undeleted and DLQ-routable, matching the malformed-
    // payload test above.
    const message = s3EventMessage([objectCreatedRecord('other/bad-key')])
    const deleteCalls: string[] = []
    const port = createOneShotPort([message], deleteCalls)

    const consumer = createSqsConsumer({
      name: 'test',
      queueUrl: 'unused',
      handleMessage: processSesInboundSqsMessage,
      port,
    })
    const failed = new Promise<[SqsMessage, unknown]>(resolve =>
      consumer.once('message-failed', (msg: SqsMessage, error: unknown) => resolve([msg, error])),
    )
    const [failedMessage, error] = await failed
    await consumer.close()

    expect(failedMessage).toEqual(message)
    expect(error).toMatchObject({ message: expect.stringContaining('incoming/') })
    expect(deleteCalls).toEqual([])
  })

  it('throws a 422 when message.body is not valid JSON', async () => {
    await expect(
      processSesInboundSqsMessage({
        messageId: randomUUID(),
        receiptHandle: randomUUID(),
        body: 'not json',
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('acks an S3 s3:TestEvent without enqueuing, so it does not redeliver toward the DLQ', async () => {
    // S3 sends this envelope (no Records) once, synchronously, whenever a bucket notification is
    // first configured -- or replaced -- to target this queue. See
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html.
    const message: SqsMessage = {
      messageId: randomUUID(),
      receiptHandle: randomUUID(),
      body: JSON.stringify({
        Service: 'Amazon S3',
        Event: 's3:TestEvent',
        Time: '2014-10-13T15:57:02.089Z',
        Bucket: BUCKET,
        RequestId: '5582815E1AEA5ADF',
        HostId: '8cLeGAmw098X5cv4Zkwcmo8vvZa3eH1eIJdUn3g7VezxL6uLj7SdiA==',
      }),
    }
    const deleteCalls: string[] = []
    const port = createOneShotPort([message], deleteCalls)

    const consumer = createSqsConsumer({
      name: 'test',
      queueUrl: 'unused',
      handleMessage: processSesInboundSqsMessage,
      port,
    })
    const deleted = new Promise<SqsMessage>(resolve => consumer.once('message-deleted', resolve))
    const deletedMessage = await deleted
    await consumer.close()

    expect(deletedMessage).toEqual(message)
    expect(deleteCalls).toEqual([message.receiptHandle])
  })
})
