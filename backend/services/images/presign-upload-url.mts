import { createS3MediaUploadPresigner } from '@vouchington/media/s3-presign'
import { S3Buckets, S3ImageUploadsClient } from '@modules/aws'

interface PresignImageUploadUrlOptions {
  s3Key: string
  contentType: string
  contentLength: number
  expiresInSeconds: number
}

/* no-mistakes: integration=aws */
export function presignImageUploadUrl(options: PresignImageUploadUrlOptions): Promise<string> {
  return createS3MediaUploadPresigner({
    bucket: S3Buckets.imageUploads,
    client: S3ImageUploadsClient,
  }).presignUpload({
    key: options.s3Key,
    contentType: options.contentType,
    contentLength: options.contentLength,
    expiresInSeconds: options.expiresInSeconds,
  })
}
