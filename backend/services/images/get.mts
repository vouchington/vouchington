import { read, write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'

type GetImageOptions = {
  includeQuarantinePending?: boolean
}

export const getImageByAny = async (
  string: string | Buffer,
  { includeQuarantinePending = false }: GetImageOptions = {},
) => {
  if (!string) return null

  const filters = ['deleted_at IS NULL']
  if (!includeQuarantinePending) filters.push('quarantine_pending_at IS NULL')
  const values = []

  if (typeof string === 'string' && isUUID(string)) {
    filters.push(`id = $${values.push(string)}`)
  } else if (typeof string === 'string' && /^[0-9a-f]{64}$/.test(string)) {
    filters.push(`sha_256 = $${values.push(Buffer.from(string, 'hex'))}`)
  } else if (Buffer.isBuffer(string)) {
    filters.push(`sha_256 = $${values.push(string)}`)
  }

  if (values.length === 0) return null

  const result = await read(
    `/* getImageByAny */
    SELECT
      id,
      created_by_id,
      created_at,
      updated_at,
      deleted_at,
      deleted_by_id,
      data,
      sha_256,
      s3_key,
      upload_staged_at,
      upload_source_deleted_at,
      quarantine_pending_at,
      quarantined_at,
      quarantine_s3_key,
      openai_omni_moderation_results,
      openai_omni_moderation_flagged,
      openai_omni_moderation_created_at
    FROM images
    WHERE ${filters.join(' AND ')}
    LIMIT 1
  `,
    values,
  )

  return result.rows[0] || null
}

export const getImageById = async (
  id: string,
  includeDeleted = false,
  { includeQuarantinePending = false }: GetImageOptions = {},
) => {
  const filters = []
  const values = []

  filters.push(`id = $${values.push(id)}`)

  if (!includeDeleted) {
    filters.push('deleted_at IS NULL')
  }
  if (!includeQuarantinePending) filters.push('quarantine_pending_at IS NULL')

  const result = await read(
    `/* getImageById */
    SELECT
      id,
      created_by_id,
      created_at,
      updated_at,
      deleted_at,
      deleted_by_id,
      data,
      sha_256,
      s3_key,
      upload_started_at,
      upload_completed_at,
      upload_failed_at,
      upload_error,
      upload_staged_at,
      upload_source_deleted_at,
      quarantine_pending_at,
      quarantined_at,
      quarantine_s3_key,
      openai_omni_moderation_results,
      openai_omni_moderation_flagged,
      openai_omni_moderation_created_at
    FROM images
    WHERE ${filters.join(' AND ')}
    LIMIT 1
  `,
    values,
  )

  return result.rows[0] || null
}

/** Read an image from the primary so workers do not observe a lagging replica immediately after completion. */
export const getImageByIdFromPrimary = async (
  id: string,
  includeDeleted = false,
  { includeQuarantinePending = false }: GetImageOptions = {},
) => {
  const filters = [`id = $1`]
  if (!includeDeleted) {
    filters.push('deleted_at IS NULL')
  }
  if (!includeQuarantinePending) filters.push('quarantine_pending_at IS NULL')

  const result = await write(
    `/* getImageByIdFromPrimary */
    SELECT
      id,
      created_by_id,
      created_at,
      updated_at,
      deleted_at,
      deleted_by_id,
      data,
      sha_256,
      s3_key,
      upload_started_at,
      upload_completed_at,
      upload_failed_at,
      upload_error,
      upload_staged_at,
      upload_source_deleted_at,
      quarantine_pending_at,
      quarantined_at,
      quarantine_s3_key,
      openai_omni_moderation_results,
      openai_omni_moderation_flagged,
      openai_omni_moderation_created_at
    FROM images
    WHERE ${filters.join(' AND ')}
    LIMIT 1
  `,
    [id],
  )

  return result.rows[0] || null
}

export const getImageByHash = async (
  hash: Buffer,
  includeDeleted = false,
  { includeQuarantinePending = false }: GetImageOptions = {},
) => {
  const filters = []
  const values = []
  filters.push(`sha_256 = $${values.push(hash)}`)

  if (!includeDeleted) {
    filters.push('deleted_at IS NULL')
  }
  if (!includeQuarantinePending) filters.push('quarantine_pending_at IS NULL')

  const result = await write(
    `/* getImageByHash */
    SELECT
      id,
      created_by_id,
      created_at,
      updated_at,
      deleted_at,
      deleted_by_id,
      data,
      sha_256,
      s3_key,
      upload_started_at,
      upload_completed_at,
      upload_failed_at,
      upload_error,
      upload_staged_at,
      upload_source_deleted_at,
      quarantine_pending_at,
      quarantined_at,
      quarantine_s3_key,
      openai_omni_moderation_results,
      openai_omni_moderation_flagged,
      openai_omni_moderation_created_at
    FROM images
    WHERE ${filters.join(' AND ')}
    LIMIT 1
  `,
    values,
  )

  return result.rows[0] || null
}
