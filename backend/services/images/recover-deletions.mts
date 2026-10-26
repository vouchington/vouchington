import { beginTransaction } from '@data-stores/psql'
import {
  enqueueImageDeletionPage,
  enqueueImageDeletionRecovery,
} from '@queues/background/enqueues/image-deletion'
import type { ImageDeletionRecoveryData } from '@queues/background/enqueues/image-deletion-jobs'
import sql from 'sql-template-strings'
import { getImagesWorkLimit } from './work-limits.mts'

/** Existing image-maintenance tick repairs lost admission and retained terminal page jobs. */
export async function recoverImageDeletions(
  imageIds?: readonly string[],
  cursor?: ImageDeletionRecoveryData,
): Promise<number> {
  await using transaction = await beginTransaction()
  let throughId = cursor?.throughId
  if (!throughId) {
    const { rows: upper } = await transaction<{
      id: string
    }>(sql`/* recoverImageDeletions:upper */ SELECT id FROM images
      WHERE deleted_at IS NOT NULL AND deletion_posts_completed_at IS NULL ORDER BY id DESC LIMIT 1`)
    throughId = upper[0]?.id
  }
  if (!throughId) {
    await transaction.commit()
    return 0
  }
  const limit = getImagesWorkLimit('cleanup_batch_size')
  const query = sql`/* recoverImageDeletions */ SELECT id, deletion_post_cursor FROM images
    WHERE deleted_at IS NOT NULL AND deletion_posts_completed_at IS NULL AND id <= ${throughId}`
  if (cursor) query.append(sql` AND id > ${cursor.afterId}`)
  if (imageIds) query.append(sql` AND id = ANY(${imageIds}::uuid[])`)
  query.append(sql` ORDER BY id LIMIT ${limit + 1}`)
  const { rows: candidates } = await transaction<{
    id: string
    deletion_post_cursor: string | null
  }>(query)
  await transaction.commit()
  const rows = candidates.slice(0, limit)
  await Promise.all(rows.map(row => enqueueImageDeletionPage(row.id, row.deletion_post_cursor)))
  const afterId = rows.at(-1)?.id
  if (!imageIds && candidates.length > limit && afterId)
    await enqueueImageDeletionRecovery({ afterId, throughId })
  return rows.length
}
