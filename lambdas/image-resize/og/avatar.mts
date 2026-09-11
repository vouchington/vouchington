import sharp from 'sharp'
import { SHARP_DECODE_OPTIONS, type EnvironmentConfig } from '../config.mts'
import type { createS3Client, fetchImageFromS3 } from '../s3/index.mts'

export interface AvatarFetchDependencies {
  createS3Client: typeof createS3Client
  fetchImageFromS3: typeof fetchImageFromS3
}

const AVATAR_SIZE = 192

// Resolves an avatar S3 key (the images-origin bucket, same one /images/*
// reads from — avatarImageId IS the S3 key, no DB lookup) to a normalized
// square PNG data URI. Never throws: a missing object (S3 404), a corrupt
// image, or any other decode failure all fall back to `undefined` so the
// caller renders the initial-letter placeholder instead of failing the whole
// card.
export async function resolveAvatarDataUri(
  avatarImageId: string,
  config: EnvironmentConfig,
  dependencies: AvatarFetchDependencies,
): Promise<string | undefined> {
  try {
    const client = dependencies.createS3Client(config.s3_bucket_origin)
    const image = await dependencies.fetchImageFromS3(
      client,
      config.s3_bucket_origin.bucket,
      avatarImageId,
    )
    try {
      const source = image.file?.path ?? image.buffer
      if (!source) return undefined
      const normalized = await sharp(source, SHARP_DECODE_OPTIONS)
        .rotate()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
        .png()
        .toBuffer()
      return `data:image/png;base64,${normalized.toString('base64')}`
    } finally {
      if (image.file) await image.file.cleanup()
    }
  } catch {
    return undefined
  }
}
