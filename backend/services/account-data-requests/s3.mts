import { createReadStream } from 'node:fs'
import {
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { S3Buckets, S3ImagesClient } from '@modules/aws'

const ONE_HOUR_SECONDS = 3600
const SEVEN_DAYS_SECONDS = 604800

/** The deterministic object key makes deletion cleanup durable before an in-flight upload completes. */
export function getExportS3Key(requestId: string, processingAttemptId: string): string {
  return `${requestId}/${processingAttemptId}.zip`
}

/* no-mistakes: integration=aws */
export async function uploadExportToS3(
  requestId: string,
  processingAttemptId: string,
  zipPath: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const s3Key = getExportS3Key(requestId, processingAttemptId)
  const body = createReadStream(zipPath)
  await S3ImagesClient.send(
    new PutObjectCommand({
      Bucket: S3Buckets.userExports,
      Key: s3Key,
      Body: body,
      ContentType: 'application/zip',
    }),
    { abortSignal },
  )
  return s3Key
}

/* no-mistakes: integration=aws */
export function getExportDownloadUrl(
  s3Key: string,
  expiresInSeconds: number = ONE_HOUR_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3Buckets.userExports,
    Key: s3Key,
    ResponseContentDisposition: 'attachment; filename="export.zip"',
  })
  return getSignedUrl(S3ImagesClient, command, { expiresIn: expiresInSeconds })
}

/* no-mistakes: integration=aws */
export async function deleteExportFromS3(s3Key: string): Promise<void> {
  await S3ImagesClient.send(
    new DeleteObjectCommand({
      Bucket: S3Buckets.userExports,
      Key: s3Key,
    }),
  )
}

/* no-mistakes: integration=aws */
export async function deleteExportsFromS3(s3Keys: string[]): Promise<void> {
  const errors: Error[] = []
  for (let offset = 0; offset < s3Keys.length; offset += 1000) {
    const chunk = s3Keys.slice(offset, offset + 1000)
    try {
      // oxlint-disable-next-line no-await-in-loop -- S3 deletion chunks are serial so every bounded provider request is attempted without an unbounded fan-out.
      const result = await S3ImagesClient.send(
        new DeleteObjectsCommand({
          Bucket: S3Buckets.userExports,
          Delete: { Objects: chunk.map(Key => ({ Key })), Quiet: true },
        }),
      )
      for (const error of result.Errors ?? []) {
        errors.push(
          new Error(
            `Failed to delete export ${error.Key ?? 'unknown'}: ${error.Message ?? error.Code}`,
          ),
        )
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Failed to delete one or more exports')
}

export { SEVEN_DAYS_SECONDS }
