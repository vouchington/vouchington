import { write } from '@data-stores/psql'
import onError from '@modules/on-error'

interface ImageMetadata {
  format?: string
  width?: number
  height?: number
  size?: number
  [key: string]: unknown
}

export async function markImageUploadFailed(imageId: string, errorMessage: string): Promise<void> {
  await write(
    `/* markImageUploadFailed */
    UPDATE images
    SET
      upload_failed_at = CURRENT_TIMESTAMP,
      upload_error = $1
    WHERE id = $2
      AND upload_started_at IS NOT NULL
      AND upload_completed_at IS NULL
      AND upload_failed_at IS NULL
  `,
    [errorMessage, imageId],
  ).catch(onError)
}

export async function finalizeImageMetadata(
  imageId: string,
  metadata: ImageMetadata,
): Promise<{ rowCount: number }> {
  const result = await write(
    `/* finalizeImageMetadata */
    UPDATE images
    SET
      data = $1,
      upload_completed_at = CURRENT_TIMESTAMP
    WHERE id = $2
      AND upload_started_at IS NOT NULL
      AND upload_completed_at IS NULL
      AND upload_failed_at IS NULL
  `,
    [metadata, imageId],
  )

  return { rowCount: result.rowCount ?? 0 }
}
