import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markTestImageUploadStaged(imageId: string): Promise<void> {
  await write(sql`
    UPDATE images
    SET upload_staged_at = CURRENT_TIMESTAMP,
        upload_source_deleted_at = NULL
    WHERE id = ${imageId}
  `)
}

export async function setTestImageHashWhileProcessing(
  imageId: string,
  sha256: Buffer,
): Promise<void> {
  await write(sql`
    UPDATE images
    SET sha_256 = ${sha256},
        upload_started_at = CURRENT_TIMESTAMP
    WHERE id = ${imageId}
  `)
}
