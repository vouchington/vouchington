# Bedrock Batch SQS Worker

Source entrypoint: [backend/workers/bedrock-batch-sqs/README.md](../../../../../../backend/workers/bedrock-batch-sqs/README.md)

Consumer package for the `bedrock-batch-sqs` SQS queue. Handles EventBridge
`model-invocation-job` completion events forwarded by SQS, mapping each event's `jobArn` /
`batchJobArn` to a batch row and enqueueing a `poll_batch` job on the existing
`bedrock-embeddings-batch` glide-mq queue.

## Exports

- `loadBedrockBatchSqs` - Function that returns a Promise resolving to `SqsConsumer | null` for the `bedrock-batch-sqs` queue.

## Related

- SQS consumer lifecycle: [../../worker-runtime/README.md](../../worker-runtime/README.md)
- Downstream glide-mq queue: [../../queues/bedrock-embeddings-batch/README.md](../../bedrock-embeddings-batch/README.md)
- Worker entrypoints: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md), [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
