import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import { createPostRevision } from '@services/post-revisions'
import sql from 'sql-template-strings'

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

export async function deleteImageDeletionPostRevision(
  revisionId: string,
  postId: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* deleteImageDeletionPostRevision */
      DELETE FROM post_revisions
      WHERE id = ${revisionId}
        AND post_id = ${postId}
    `,
    options,
  )
}
