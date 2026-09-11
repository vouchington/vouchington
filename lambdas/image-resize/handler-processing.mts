import type { APIGatewayProxyResult } from 'aws-lambda'
import { captureException } from '@lambdas/shared/sentry'
import type { OutputFormat, SideloadConfig } from './config.mts'
import { S3OperationError } from './errors.mts'
import {
  buildFileResponse,
  buildResponse,
  buildErrorResponse,
  FORMAT_TO_CONTENT_TYPE,
} from './response/index.mts'
import { type FetchedImage, type ImageBody, isTempImageFile } from './temp-file.mts'
import {
  createS3Client as defaultCreateS3Client,
  fetchImageFromS3 as defaultFetchImageFromS3,
  putImageToCache as defaultPutImageToCache,
} from './s3/index.mts'
import { transformImage as defaultTransformImage, transformImageFile } from './transform/index.mts'

export interface ImageRequestParams {
  width: number
  height?: number
  quality: number
  lossless: boolean
  progressive: boolean
  format?: OutputFormat
  acceptHeader?: string
}

export interface ImageRequestDependencies {
  createS3Client: typeof defaultCreateS3Client
  fetchImageFromS3: typeof defaultFetchImageFromS3
  putImageToCache: typeof defaultPutImageToCache
  transformImage: (
    input: ImageBody,
    options: Parameters<typeof defaultTransformImage>[1],
  ) => Promise<ImageBody>
  captureCacheWriteError: (error: unknown) => void
}

export const defaultImageRequestDependencies: ImageRequestDependencies = {
  createS3Client: defaultCreateS3Client,
  fetchImageFromS3: defaultFetchImageFromS3,
  putImageToCache: defaultPutImageToCache,
  transformImage: (input, options) =>
    isTempImageFile(input)
      ? transformImageFile(input, options)
      : defaultTransformImage(input, options),
  captureCacheWriteError: captureException,
}

export async function processImageRequest(
  requestParams: ImageRequestParams,
  config: SideloadConfig,
  format: OutputFormat,
  width: number,
  quality: number,
  cacheKey: string,
  fetchOrigin: () => Promise<FetchedImage>,
  dependencies: ImageRequestDependencies = defaultImageRequestDependencies,
): Promise<APIGatewayProxyResult> {
  if (requestParams.height && requestParams.height > config.maxHeight) {
    return buildErrorResponse(400, `Height exceeds maximum allowed: ${config.maxHeight}`)
  }

  const cacheClient = dependencies.createS3Client(config.s3_bucket_cache)

  try {
    const cached = await dependencies.fetchImageFromS3(
      cacheClient,
      config.s3_bucket_cache.bucket,
      cacheKey,
    )
    if (cached.file) {
      try {
        return await buildFileResponse(200, cached.file, format)
      } finally {
        await cached.file.cleanup()
      }
    }
    if (cached.buffer) return buildResponse(200, cached.buffer, format)
    throw new Error('Image fetch returned no artifact')
  } catch (error: unknown) {
    if (!(error instanceof S3OperationError) || error.statusCode !== 404) {
      throw error
    }
  }

  const origin = await fetchOrigin()
  const originBody = origin.file ?? origin.buffer
  if (!originBody) throw new Error('Image fetch returned no artifact')
  let transformed: ImageBody | undefined
  try {
    transformed = await dependencies.transformImage(originBody, {
      width,
      height: requestParams.height,
      quality,
      lossless: requestParams.lossless,
      progressive: requestParams.progressive,
      format,
    })

    try {
      await dependencies.putImageToCache(
        cacheClient,
        config.s3_bucket_cache.bucket,
        cacheKey,
        transformed,
        FORMAT_TO_CONTENT_TYPE[format],
        origin.etag,
      )
    } catch (error: unknown) {
      console.error(`Failed to write image cache key ${cacheKey}`, error)
      dependencies.captureCacheWriteError(error)
    }

    if (isTempImageFile(transformed)) return await buildFileResponse(200, transformed, format)
    return buildResponse(200, transformed, format)
  } finally {
    if (origin.file) await origin.file.cleanup()
    if (transformed && isTempImageFile(transformed)) await transformed.cleanup()
  }
}
