import { write } from '@data-stores/psql'
import createHttpError from 'http-errors'
// Canonical definition lives in @voucha/types/entities/image (avoids a
// services/images <-> queues/images <-> data-stores/valkey workspace cycle:
// data-stores/valkey needs this type but must not depend on @services/images).
import type { ImageUploadState } from '@voucha/types/entities/image'

export type { ImageUploadState } from '@voucha/types/entities/image'

type ImageUploadStateRow = {
  id: string
  created_by_id: string
  upload_started_at: Date | null
  upload_completed_at: Date | null
  upload_failed_at: Date | null
  upload_error: string | null
  deleted_at: Date | null
  quarantine_pending_at: Date | null
  openai_omni_moderation_created_at: Date | null
  openai_omni_moderation_flagged: boolean | null
}

export function deriveUploadStatus(row: {
  upload_started_at: Date | null
  upload_completed_at: Date | null
  upload_failed_at: Date | null
}): 'pending' | 'processing' | 'complete' | 'failed' {
  if (row.upload_failed_at) return 'failed'
  if (row.upload_completed_at) return 'complete'
  if (row.upload_started_at) return 'processing'
  return 'pending'
}

export async function getImageUploadState(
  currentUserId: string,
  imageId: string,
): Promise<ImageUploadState> {
  // Lag-sensitive: state streams subscribe before this initial read, so a
  // terminal update published just before connection must be visible here.
  const { rows } = await write<ImageUploadStateRow>(
    `/* getImageUploadState */
    SELECT id, created_by_id, upload_started_at, upload_completed_at, upload_failed_at,
           upload_error, deleted_at, quarantine_pending_at,
           openai_omni_moderation_created_at, openai_omni_moderation_flagged
    FROM images
    WHERE id = $1
  `,
    [imageId],
  )

  const row = rows[0]
  if (!row) throw createHttpError(404, 'Image not found')
  if (row.created_by_id !== currentUserId) throw createHttpError(404, 'Image not found')

  // blocked = image excluded by moderation: either soft-deleted OR flagged (before delete runs).
  // Treating flagged as blocked closes the race window where deleteImageById fails or is
  // interrupted after applyImageOpenAIModerationResults writes flagged=true, which would
  // otherwise leave the client stuck polling until timeout.
  const blocked =
    row.deleted_at !== null ||
    row.quarantine_pending_at !== null ||
    row.openai_omni_moderation_flagged === true
  // ready requires: metadata extraction done (complete), moderation run (created_at non-null),
  // and not blocked.
  // Race window: extract-metadata sets upload_completed_at before enqueuing moderation.
  // Checking openai_omni_moderation_created_at closes that window.
  const moderated = row.openai_omni_moderation_created_at !== null
  const upload_status = deriveUploadStatus(row)
  return {
    id: row.id,
    upload_status,
    upload_error: row.upload_error,
    blocked,
    ready: !blocked && upload_status === 'complete' && moderated,
  }
}
