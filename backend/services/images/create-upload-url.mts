import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { mintUUIDv7 } from '@modules/utils/ids'
import { MediaError, validateMediaUpload } from '@vouchington/media'
import { SUPPORTED_IMAGE_FORMATS } from './constants.mts'
import { presignImageUploadUrl } from './presign-upload-url.mts'
import createHttpError from 'http-errors'

const PRESIGNED_URL_EXPIRATION_SECONDS = 3600 // 1 hour

interface CreateUploadUrlOptions {
  contentType: string
  contentLength: number
}

export async function createImageUploadUrl(user: { id: string }, options: CreateUploadUrlOptions) {
  const { contentType: normalizedContentType } = validateImageUpload(options)
  await using transaction = await beginTransaction()

  const imageId = mintUUIDv7()
  const s3Key = imageId

  const uploadUrl = await presignImageUploadUrl({
    s3Key,
    contentType: normalizedContentType,
    contentLength: options.contentLength,
    expiresInSeconds: PRESIGNED_URL_EXPIRATION_SECONDS,
  })

  const id = await insertImageUploadRecord(transaction, user.id, imageId)
  await transaction.commit()

  return {
    image_id: id,
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
        return SUPPORTED_IMAGE_FORMATS.some(
          supportedFormat => contentType === `image/${supportedFormat}`,
        )
      },
    })
  } catch (err) {
    if (!(err instanceof MediaError)) throw err
    if (err.code === 'CONTENT_TYPE_INVALID') {
      if (rejectedFormat) throw createHttpError(400, `Unsupported format: ${rejectedFormat}`)
      throw createHttpError(400, `Invalid content type: ${options.contentType}`)
    }
    if (err.code === 'CONTENT_LENGTH_INVALID') {
      if (!Number.isInteger(options.contentLength)) {
        throw createHttpError(400, 'Content length must be an integer')
      }
      if (options.contentLength <= 0) {
        throw createHttpError(400, 'Content length must be greater than 0')
      }
      throw createHttpError(400, 'Image too large (max 50MB)')
    }
    throw err
  }
}

/** Persist staging provenance after presigning, using the same active-owner snapshot as the insert. */
export async function insertImageUploadRecord(
  query: QueryExecutor,
  userId: string,
  imageId: string,
): Promise<string> {
  // Source provenance and the selected presign bucket commit together in the row.
  const { rows } = await query<{ id: string }>(
    `/* createImageUploadUrl */
    INSERT INTO images (
      id,
      s3_key,
      created_by_id,
      data,
      sha_256,
      upload_staged_at
    )
    SELECT
      $1,
      $2,
      $3,
      '{}'::jsonb,
      NULL,
      CURRENT_TIMESTAMP
    FROM users
    WHERE users.id = $3 AND users.deleted_at IS NULL
    RETURNING id
  `,
    [imageId, imageId, userId],
  )
  if (!rows[0]) throw createHttpError(401, 'User not found')
  return rows[0]!.id
}
