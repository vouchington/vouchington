import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'

/** The publication worker pages current aliases instead of expanding every slug for a post. */
export async function listLivePostSlugsPage(
  postId: string,
  afterSlug: string | null,
): Promise<{ slugs: string[]; cursor: string | null }> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ slug: string }>(
    `/* listLivePostSlugsPage */
    SELECT slug FROM post_slugs
    WHERE post_id = $1::uuid
      AND slug > COALESCE($2::text, ''::text)
    ORDER BY slug LIMIT $3`,
    [postId, afterSlug, limit],
  )
  return {
    slugs: rows.map(row => row.slug),
    cursor: rows.length === limit ? rows.at(-1)!.slug : null,
  }
}
