import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { attachPostProvenance, attachWrittenPostProvenance } from '@services/content-provenance'
import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import { maskAnonymousPost, type Post } from '@services/posts'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

/** The post fields the MCP read tools return, in output order. */
export const MCP_POST_FIELDS = [
  'id',
  'slug',
  'post_type',
  'title',
  'markdown',
  'parent_post_id',
  'root_post_id',
  'created_by_id',
  'is_anonymous',
  'created_at',
  'updated_at',
  'provenance',
] as const

/** One post as an MCP client receives it. */
export type McpPost = {
  id: string
  slug: string | null
  post_type: Post['post_type']
  title: string
  markdown: string
  parent_post_id: string | null
  root_post_id: string | null
  created_by_id: string | null
  is_anonymous: boolean
  created_at: string
  updated_at: string
  /** The public provenance facts of an API or MCP post, on every tool; never the staff detail. */
  provenance?: Post['provenance']
}

/** The published schema of an `McpPost`, from the generated `Post` contract. */
export function mcpPostSchema() {
  return closedObject(pickProperties('Post', MCP_POST_FIELDS), ['provenance'])
}

/**
 * Maps a post to its MCP shape, carrying the `provenance` it already has. Read tools go through
 * `toMcpPosts` and write tools through `toWrittenMcpPost`, which attach it. User text is sanitized
 * and wrapped as external content, like `search_posts`. The author of an anonymous post is hidden
 * from every caller, including the author and administrators, so the answer never depends on who
 * asks.
 */
async function toMcpPost(post: Post): Promise<McpPost> {
  return {
    id: post.id,
    slug: post.slug ?? null,
    post_type: post.post_type,
    title: await sanitizePromptInjection(post.title, { isTitle: true }),
    markdown: wrapExternalContent(await sanitizePromptInjection(post.markdown), {
      source: 'post',
      contentType: 'user_post',
    }),
    parent_post_id: post.parent_post_id ?? null,
    root_post_id: post.root_post_id ?? null,
    created_by_id: maskAnonymousPost(post, null)?.created_by_id ?? null,
    is_anonymous: post.is_anonymous,
    created_at: new Date(post.created_at).toISOString(),
    updated_at: new Date(post.updated_at).toISOString(),
    ...(post.provenance && { provenance: post.provenance }),
  }
}

/**
 * Maps readable posts for MCP with their public provenance label. The label is the signed-out
 * one, so an anonymous post never names its OAuth client. Staff provenance is REST-only.
 */
export async function toMcpPosts(posts: Post[]): Promise<McpPost[]> {
  return Promise.all((await attachPostProvenance(posts, null)).map(toMcpPost))
}

/**
 * Maps the post a write tool just wrote, with the same public provenance a read of it returns: the
 * signed-out one, so an anonymous post never names its OAuth client even to its author. The row is
 * read from the primary because it was committed an instant ago.
 */
export async function toWrittenMcpPost(post: Post): Promise<McpPost> {
  return toMcpPost(await attachWrittenPostProvenance(post, null))
}

/**
 * The posts among `ids` that exist, mapped for MCP, in the order of `ids`. The caller has already
 * decided that each id is readable: this only hydrates, it does not check access.
 */
export async function loadMcpPosts(ids: string[]): Promise<McpPost[]> {
  const posts = await getPostByAnyCachedBatch(ids)
  return toMcpPosts(posts.filter((post): post is Post => Boolean(post)))
}
