import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function removeTestPostImage(postId: string, imageId: string): Promise<void> {
  await write(sql`
    DELETE FROM post_images
    WHERE post_id = ${postId} AND image_id = ${imageId}
  `)
}
