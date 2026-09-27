import { write } from '@data-stores/psql'
import { MediaError, validateMediaUpload } from '@vouchington/media'
import { v7 } from 'uuid'
import { SUPPORTED_IMAGE_FORMATS } from './constants.mts'
import { presignImageUploadUrl } from './presign-upload-url.mts'
import createHttpError from 'http-errors'

const PRESIGNED_URL_EXPIRATION_SECONDS = 3600 // 1 hour

interface CreateUploadUrlOptions {
  contentType: string
  contentLength: number
  dependencies?: Partial<CreateImageUploadUrlDependencies>
}

type CreateImageUploadUrlDependencies = {
  presignImageUploadUrl: typeof presignImageUploadUrl
}

const defaultDependencies: CreateImageUploadUrlDependencies = {
  presignImageUploadUrl,
}

export async function createImageUploadUrl(user: { id: string }, options: CreateUploadUrlOptions) {
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const { contentType: normalizedContentType } = validateImageUpload(options)

  const imageId = v7()
  const s3Key = imageId

  const uploadUrl = await dependencies.presignImageUploadUrl({
    s3Key,
    contentType: normalizedContentType,
    contentLength: options.contentLength,
    expiresInSeconds: PRESIGNED_URL_EXPIRATION_SECONDS,
  })

  // Source provenance and the selected presign bucket commit together in the row.
  const { rows } = await write(
    `/* createImageUploadUrl */
    INSERT INTO images (
      id,
      s3_key,
      created_by_id,
      data,
      sha_256,
      upload_staged_at
    )
    VALUES (
      $1,
      $2,
      $3,
      '{}'::jsonb,
      NULL,
      CURRENT_TIMESTAMP
    )
    RETURNING id
  `,
    [imageId, s3Key, user.id],
  )

  return {
    image_id: rows[0].id,
    upload_url: uploadUrl,
    content_type: normalizedContentType,
    expires_at: new Date(Date.now() + PRESIGNED_URL_EXPIRATION_SECONDS * 1000).toISOString(),
  }
}

function validateImageUpload(options: CreateUploadUrlOptions) {
  let rejectedFormat: string | undefined
  try {
    return validateMediaUpload(options, {
      maxBytes: 50 * 1024 * 1024,
      acceptsContentType(contentType) {
        const format = contentType.split('/')[1]
        if (format && !SUPPORTED_IMAGE_FORMATS.includes(format)) rejectedFormat = format
        return format !== undefined && SUPPORTED_IMAGE_FORMATS.includes(format)
      },
    })
  } catch (error) {
    if (!(error instanceof MediaError)) throw error
    if (error.code === 'CONTENT_TYPE_INVALID') {
      if (rejectedFormat) throw createHttpError(400, `Unsupported format: ${rejectedFormat}`)
      throw createHttpError(400, `Invalid content type: ${options.contentType}`)
    }
    if (error.code === 'CONTENT_LENGTH_INVALID') {
      if (!Number.isInteger(options.contentLength)) {
        throw createHttpError(400, 'Content length must be an integer')
      }
      if (options.contentLength <= 0) {
        throw createHttpError(400, 'Content length must be greater than 0')
      }
      throw createHttpError(400, 'Image too large (max 50MB)')
    }
    throw error
  }
}
