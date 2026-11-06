import {
  getPostHackerNewsSummaries,
  getPostHackerNewsDetails,
} from '@services/urls/hacker-news-sidecars'
import type {
  HackerNewsReferenceCounts,
  HackerNewsReferenceDetail,
} from '@services/urls/hacker-news-references-types'
import { mcpHackerNewsReferenceSchema } from './mcp-hacker-news-output.mts'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { attachPostProvenance, attachWrittenPostProvenance } from '@services/content-provenance'
import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import { maskCommentPlaceholders, type Post } from '@services/posts'
import {
  projectPublicPost,
  PUBLIC_POST_FIELDS,
  type PublicPost,
} from '@services/posts/public-post-projection'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

/** The post fields the MCP read tools return, in output order. */
const MCP_POST_FIELDS = PUBLIC_POST_FIELDS

/** One post as an MCP client receives it. */
export type McpPost = PublicPost & {
  hacker_news_references?: HackerNewsReferenceCounts | HackerNewsReferenceDetail
}

/** The published schema of an `McpPost`, from the generated `Post` contract. */
export function mcpPostSchema(details = false) {
  return closedObject(
    {
      ...pickProperties('Post', MCP_POST_FIELDS),
      hacker_news_references: mcpHackerNewsReferenceSchema(details),
    },
    ['provenance', 'placeholder_state', 'hacker_news_references'],
  )
}

/**
 * Maps a post to its MCP shape, carrying the `provenance` it already has. Read tools go through
 * `toMcpPosts` and write tools through `toWrittenMcpPost`, which attach it. User text is sanitized
 * and wrapped as external content, like `read_posts (option search)`. The author of an anonymous post is hidden
 * from every caller, including the author and administrators, so the answer never depends on who
 * asks.
 */
async function toMcpPost(post: Post): Promise<McpPost> {
  const publicPost = projectPublicPost(post)
  // A placeholder has no user text, so there is nothing to sanitize or wrap as external content.
  if (publicPost.placeholder_state) return publicPost
  return {
    ...publicPost,
    title: await sanitizePromptInjection(publicPost.title, { isTitle: true }),
    markdown: wrapExternalContent(await sanitizePromptInjection(publicPost.markdown), {
      source: 'post',
      contentType: 'user_post',
    }),
  }
}

/**
 * Maps readable posts for MCP with their public provenance label. The label is the signed-out
 * one, so an anonymous post never names its OAuth client. Staff provenance is REST-only.
 */
export async function toMcpPosts(
  posts: Post[],
  { details = false }: { details?: boolean } = {},
): Promise<McpPost[]> {
  const [labeled, references] = await Promise.all([
    attachPostProvenance(posts, null),
    (details ? getPostHackerNewsDetails : getPostHackerNewsSummaries)(posts.map(post => post.id)),
  ])
  return Promise.all(
    maskCommentPlaceholders(labeled, null).map(async masked => {
      const post = masked as Post
      return {
        ...(await toMcpPost(post)),
        ...(references[post.id] && { hacker_news_references: references[post.id] }),
      }
    }),
  )
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
