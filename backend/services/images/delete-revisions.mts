import type { QueryOptions } from '@data-stores/psql/types'
import { createPostRevision } from '@services/post-revisions'

export async function createImageDeletionPostRevision(
  postId: string,
  imageIds: string[],
  deletedImageId: string,
  options: QueryOptions,
): Promise<string> {
  const revision = await createPostRevision(
    postId,
    'update',
    {
      post_images: {
        before: imageIds,
        after: imageIds.filter(id => id !== deletedImageId),
      },
    },
    null,
    options,
  )
  return revision.id
}
