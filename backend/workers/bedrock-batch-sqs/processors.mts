import type { SqsMessage } from '@backend/worker-runtime'
import { enqueueBulkProcessEmbeddingBatchPolling } from '@queues/bedrock-embeddings-batch/enqueues'
import { getBatchIdByJobArn } from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'

// EventBridge delivers the Bedrock batch completion event directly to this queue (no SNS
// wrapping), so the message body is the raw EventBridge event. AWS Bedrock Batch Inference events
// put the ARN under 'jobArn'; some EventBridge samples document 'batchJobArn'. Accept both, matching
// the Lambda bridge this replaces.
export async function processBedrockBatchSqsMessage(message: SqsMessage): Promise<void> {
  const event = JSON.parse(message.body) as { detail?: Record<string, unknown> } | null
  const jobArn = event?.detail?.['jobArn'] ?? event?.detail?.['batchJobArn']
  if (typeof jobArn !== 'string' || jobArn.length === 0) {
    throw new Error('EventBridge event missing jobArn in detail')
  }

  const batchId = await getBatchIdByJobArn(jobArn)
  if (batchId === null) {
    // Throw rather than drop: a fresh batch row may not have committed yet when this event
    // arrives, so redelivery lets the DB write catch up. If the jobArn is truly unknown, this
    // exhausts the queue's maxReceiveCount and lands in the DLQ instead of retrying forever.
    throw new Error(`Batch not found for jobArn: ${jobArn}`)
  }

  // Enqueue the full polling job (status fetch + result download + embedding application).
  // Do not call processBatch() directly -- that only updates the DB status column and never
  // downloads or applies the batch results.
  await enqueueBulkProcessEmbeddingBatchPolling([batchId])
}
