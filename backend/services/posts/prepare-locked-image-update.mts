import type { TransactionQuery } from '@data-stores/psql/types'
import { lockPostPublication } from '@services/post-publication'
import { runSequentially } from '@modules/utils/run-sequentially'
import { getLockedPostImagePublicationState } from './image-publication-state.mts'
import { preparePostImageDeliveryMutation } from './media-delivery.mts'
import {
  imageDeliveryAuthorityStartedSql,
  lockImageAssetAdmission,
} from '@services/media-delivery-safety'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export async function lockPostImageAdmission(
  query: TransactionQuery,
  imageIds: string[],
): Promise<void> {
  await lockImageAssetAdmission(imageIds, query)
  if (!imageIds.length) return
  // The share-lock statement also records that delivery authority has started.
  const statement = sql`/* setPostImages:lockImages */
    SELECT id, `
  statement.append(imageDeliveryAuthorityStartedSql())
  statement.append(sql` AS authority_started
    FROM images WHERE id = ANY(${imageIds}::uuid[])
      AND upload_completed_at IS NOT NULL AND deleted_at IS NULL AND quarantine_pending_at IS NULL
    ORDER BY id FOR SHARE
  `)
  const { rows } = await query<{ id: string }>(statement)
  assert(rows.length === imageIds.length, 400, 'Image not found or not complete')
}

export async function prepareLockedPostImageUpdate(
  query: TransactionQuery,
  postId: string,
  imageIds: string[],
): Promise<Awaited<ReturnType<typeof getLockedPostImagePublicationState>>> {
  let postState: Awaited<ReturnType<typeof getLockedPostImagePublicationState>> | null = null
  await runSequentially([
    () =>
      preparePostImageDeliveryMutation(query, {
        postId,
        imageIds,
        retainImageIds: imageIds,
      }),
    () => lockPostPublication(query, postId),
    async () => {
      postState = await getLockedPostImagePublicationState(query, postId)
    },
  ])
  if (!postState) throw new Error(`Post ${postId} was not locked for its image update`)
  return postState
}
