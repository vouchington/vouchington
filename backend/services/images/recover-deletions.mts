import { beginTransaction } from '@data-stores/psql'
import {
  enqueueImageDeletionPages,
  enqueueImageDeletionRecovery,
} from '@queues/background/enqueues/image-deletion'
import type { ImageDeletionRecoveryData } from '@queues/background/enqueues/image-deletion-jobs'
import sql from 'sql-template-strings'

/** Image maintenance admits one dispatcher; queue capacity is checked before it reads each page. */
export async function recoverImageDeletions(imageIds?: readonly string[]): Promise<void> {
  await enqueueImageDeletionRecovery(imageIds ? { imageIds } : {})
}

/** Fix one upper bound and admit one page; poisoned front rows cannot starve later images. */
export async function dispatchImageDeletionRecoveryPage(
  data: ImageDeletionRecoveryData,
  pageSize: number,
): Promise<{ result: number; next?: ImageDeletionRecoveryData }> {
  await using transaction = await beginTransaction()
  let throughId = data.throughId
  if (!throughId) {
    const upperQuery = sql`/* dispatchImageDeletionRecoveryPage:upper */ SELECT id FROM images
      WHERE deleted_at IS NOT NULL AND deletion_posts_completed_at IS NULL`
    if (data.imageIds) upperQuery.append(sql` AND id = ANY(${data.imageIds}::uuid[])`)
    upperQuery.append(sql` ORDER BY id DESC LIMIT 1`)
    const { rows: upper } = await transaction<{ id: string }>(upperQuery)
    throughId = upper[0]?.id
  }
  if (!throughId) {
    await transaction.commit()
    return { result: 0 }
  }
  const query = sql`/* dispatchImageDeletionRecoveryPage */ SELECT id, deletion_post_cursor FROM images
    WHERE deleted_at IS NOT NULL AND deletion_posts_completed_at IS NULL AND id <= ${throughId}`
  if (data.afterId) query.append(sql` AND id > ${data.afterId}`)
  if (data.imageIds) query.append(sql` AND id = ANY(${data.imageIds}::uuid[])`)
  query.append(sql` ORDER BY id LIMIT ${pageSize + 1}`)
  const { rows: candidates } = await transaction<{
    id: string
    deletion_post_cursor: string | null
  }>(query)
  await transaction.commit()
  const rows = candidates.slice(0, pageSize)
  await enqueueImageDeletionPages(
    rows.map(row => ({ imageId: row.id, cursor: row.deletion_post_cursor })),
  )
  const afterId = rows.at(-1)?.id
  return {
    result: rows.length,
    ...(candidates.length > pageSize && afterId ? { next: { ...data, afterId, throughId } } : {}),
  }
}
