import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

/**
 * Assert that an image exists, is complete, and is not deleted.
 * Does NOT check ownership — callers (e.g. topic logo/hero updates) are
 * restricted to admins by their own authorization checks, so any uploaded
 * image is considered available for use.
 */
export async function assertImageExists(imageId: string): Promise<void> {
  const { rows } = await read(
    sql`/* assertImageExists */ SELECT id FROM images WHERE id = ${imageId} AND upload_completed_at IS NOT NULL AND deleted_at IS NULL LIMIT 1`,
  )
  assert(rows.length > 0, 400, 'Image not found or not complete')
}
