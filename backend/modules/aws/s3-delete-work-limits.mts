/** Internal per-call pressure bound. S3 still accepts at most 1,000 keys per request. */
export function getS3DeleteBatchSize(batchSize: number): number {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new RangeError('S3 delete batch size must be an integer between 1 and 1000')
  }
  return batchSize
}
