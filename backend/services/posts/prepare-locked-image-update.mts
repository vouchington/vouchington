import type { TransactionQuery } from '@data-stores/psql/types'
import { lockPostPublication } from '@services/post-publication'
import { runSequentially } from '@modules/utils/run-sequentially'
import { getLockedPostImagePublicationState } from './image-publication-state.mts'
import { preparePostImageDeliveryMutation } from './media-delivery.mts'

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
