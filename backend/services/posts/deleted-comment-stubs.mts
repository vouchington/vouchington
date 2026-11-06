import { read } from '@data-stores/psql'
import { isSlug, isUUID } from '@modules/utils'
import { caches } from '@services/entity-cache/caches'
import { getPostsByAnyBatch } from './get-batch.mts'
import type { Post } from './types.mts'

type StubRow = Pick<
  Post,
  | 'id'
  | 'post_type'
  | 'parent_post_id'
  | 'root_post_id'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'approved_at'
  | 'broadcast'
  | 'privacy'
  | 'community_id'
  | 'created_by_id'
>

const getPostByAnyCachedBatch = caches.posts.cacheGetByAnyBatch<Post>(getPostsByAnyBatch)

/**
 * Deleted comments by id or slug, reduced to the fields a placeholder keeps. `view_posts` leaves
 * deleted posts out, so a placeholder for one is built from the row itself; the content is never
 * read. Only comments are returned, keyed by the identifier asked for and by id.
 */
export async function getDeletedCommentStubs(identifiers: string[]): Promise<Map<string, Post>> {
  const inputs = [...new Set(identifiers.map(id => id.toLowerCase()))]
  const ids = inputs.filter(isUUID)
  const slugs = inputs.filter(id => !isUUID(id) && isSlug(id))
  const stubs = new Map<string, Post>()
  if (ids.length === 0 && slugs.length === 0) return stubs
  const { rows } = await read<StubRow & { input_slug: string | null }>(
    `/* getDeletedCommentStubs */
    WITH wanted AS (
      SELECT unnest($1::uuid[]) AS post_id, NULL::text AS input_slug
      UNION ALL
      SELECT post_slugs.post_id, post_slugs.slug
      FROM post_slugs
      WHERE post_slugs.slug = ANY($2::text[])
    )
    SELECT posts.id, posts.post_type, posts.parent_post_id, posts.root_post_id, posts.created_at,
           posts.updated_at, posts.deleted_at, posts.approved_at, posts.broadcast, posts.privacy,
           posts.community_id, posts.created_by_id, wanted.input_slug
    FROM wanted
    JOIN posts ON posts.id = wanted.post_id
    WHERE posts.deleted_at IS NOT NULL
      AND posts.post_type = 'comment'`,
    [ids, slugs],
  )
  for (const { input_slug, ...row } of rows) {
    const stub = {
      __entity_type: 'post',
      slug: null,
      title: '',
      markdown: '',
      ai_summary_markdown: '',
      updated_by_id: null,
      deleted_by_id: null,
      archived_at: null,
      archived_by_id: null,
      rejected_at: null,
      in_review_at: null,
      locked_at: null,
      locked_by_id: null,
      is_anonymous: false,
      clearance_status: 'pending',
      clearance_reason: null,
      clearance_updated_at: null,
      ...row,
    } as Post
    stubs.set(stub.id, stub)
    if (input_slug) stubs.set(input_slug, stub)
  }
  return stubs
}

/**
 * Posts in the order of `ids`, each a cached post or, when it is a deleted comment, its stub; null
 * for anything else that does not exist. For a reader that renders a deleted comment as a
 * placeholder; the stub carries no content.
 */
export async function getPostsOrDeletedCommentStubs(ids: string[]): Promise<(Post | null)[]> {
  const posts = await getPostByAnyCachedBatch(ids)
  const missing = ids.filter((_, index) => !posts[index])
  if (missing.length === 0) return posts
  const stubs = await getDeletedCommentStubs(missing)
  return posts.map((post, index) => post ?? stubs.get(ids[index]!.toLowerCase()) ?? null)
}
