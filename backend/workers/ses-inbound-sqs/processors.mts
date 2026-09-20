import assert from 'http-assert'
import type { SqsMessage } from '@backend/worker-runtime'
import { enqueueSesInboundProcess } from '@queues/ses-inbound/enqueues'
import {
  createSesInboundProcessJobId,
  decodeS3EventObjectKey,
  getSesMessageIdFromObjectKey,
  getSesInboundKindFromObjectKey,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'

interface S3EventRecord {
  eventSource?: string
  eventName?: string
  s3?: { bucket?: { name?: string }; object?: { key?: string } }
}

interface S3Event {
  Records?: S3EventRecord[]
}

// S3 sends this envelope (no `Records`) exactly once, synchronously, the moment a bucket
// notification is first configured (or replaced) to target this queue -- see
// https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html.
// The #9273 PR 2/3 cutover triggers one on the apply that retargets
// aws_s3_bucket_notification.ses_inbound's queue block. It is a valid control message, not
// malformed input: ack (delete) it without enqueuing, so it never redelivers toward the DLQ.
interface S3TestEvent {
  Service?: string
  Event?: string
}

function isS3TestEvent(event: S3Event & S3TestEvent): boolean {
  return event.Service === 'Amazon S3' && event.Event === 's3:TestEvent'
}

// The S3 bucket notification (vouchington-infra/opentofu/sqs-event-ingress.tf, vouchington-infra/opentofu/ses-inbound.tf:
// aws_s3_bucket_notification.ses_inbound) targets this queue directly -- this consumer parses the
// S3 ObjectCreated event and reuses the unmodified @ts-shared/ses-inbound-contract functions and
// the @queues/ses-inbound/enqueues producer to hand off to the downstream ses_inbound glide-mq
// queue/worker/reconciler. A malformed or unrecognized message throws (via http-assert) rather than
// being swallowed, so SQS redelivery/maxReceiveCount routes it to this queue's DLQ
// (vouchington-infra/opentofu/sqs-event-ingress.tf: aws_sqs_queue.ses_inbound_dlq) instead of silently dropping it.
export async function processSesInboundSqsMessage(message: SqsMessage): Promise<void> {
  let event: S3Event & S3TestEvent
  try {
    event = JSON.parse(message.body) as S3Event & S3TestEvent
  } catch {
    assert(false, 422, 'SES inbound SQS message body is not valid JSON')
  }
  if (isS3TestEvent(event)) return
  const jobs = parseS3Event(event)
  for (const data of jobs) {
    // oxlint-disable-next-line no-await-in-loop -- preserve S3 batch backpressure; a rejection must retry the message
    await enqueueSesInboundProcess(data)
  }
}

function parseS3Event(event: S3Event): SesInboundProcessJobData[] {
  assert(
    Array.isArray(event.Records) && event.Records.length > 0,
    422,
    'SES inbound S3 event must contain at least one record',
  )

  const expectedBucketName = getExpectedBucketName()
  const payloads = new Map<string, SesInboundProcessJobData>()
  for (const record of event.Records ?? []) {
    assert(
      record.eventSource === 'aws:s3' && record.eventName?.startsWith('ObjectCreated:'),
      422,
      `SES inbound SQS consumer accepts only S3 ObjectCreated events, got eventSource=${JSON.stringify(record.eventSource)} eventName=${JSON.stringify(record.eventName)}`,
    )
    const bucketName = record.s3?.bucket?.name
    assert(
      bucketName === expectedBucketName,
      422,
      `Unexpected SES inbound S3 bucket ${JSON.stringify(bucketName)}`,
    )
    const encodedKey = record.s3?.object?.key
    assert(
      typeof encodedKey === 'string' && encodedKey.length > 0,
      422,
      'SES inbound S3 event record missing s3.object.key',
    )

    const objectKey = decodeS3EventObjectKey(encodedKey)
    const sesMessageId = getSesMessageIdFromObjectKey(objectKey)
    const logicalId = createSesInboundProcessJobId(objectKey)
    payloads.set(logicalId, {
      sesMessageId,
      objectKey,
      intakeKind: getSesInboundKindFromObjectKey(objectKey),
    })
  }
  return [...payloads.values()]
}

function getExpectedBucketName(): string {
  const bucket = process.env.S3_BUCKET_SES_INBOUND?.trim()
  assert(bucket, 500, 'S3_BUCKET_SES_INBOUND is required')
  return bucket
}
