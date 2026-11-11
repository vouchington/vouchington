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
import { attachPostProvenance } from '@services/content-provenance'
import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import { maskCommentPlaceholders, type Post } from '@services/posts'
import {
  projectPublicPost,
  PUBLIC_POST_FIELDS,
  type PublicPost,
} from '@services/posts/public-post-projection'
import { projectMcpRecommendation } from './topic-recommendation-read-output.mts'
import type { TopicRecommendationPost } from '@services/topic-recommendations'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

/** The post fields the MCP read tools return, in output order. */
const MCP_POST_FIELDS = PUBLIC_POST_FIELDS
const SUMMARY_FIELDS = [
  'id',
  'slug',
  'post_type',
  'title',
  'parent_post_id',
  'root_post_id',
  'placeholder_state',
] as const

/** One post as an MCP client receives it. */
export type McpPost = PublicPost & {
  topic_recommendation?: Post['topic_recommendation']
  hacker_news_references?: HackerNewsReferenceCounts | HackerNewsReferenceDetail
}

export type McpPostSummary = Pick<McpPost, (typeof SUMMARY_FIELDS)[number]> & {
  hacker_news_references?: HackerNewsReferenceCounts
}

/** The published schema of an `McpPost`, from the generated `Post` contract. */
export function mcpPostSchema(details = false) {
  return closedObject(
    {
      ...pickProperties('Post', details ? MCP_POST_FIELDS : SUMMARY_FIELDS),
      ...(details ? pickProperties('Post', ['topic_recommendation']) : {}),
      hacker_news_references: mcpHackerNewsReferenceSchema(details),
    },
    ['provenance', 'placeholder_state', 'hacker_news_references', 'topic_recommendation'],
  )
}

/**
 * Maps a post to its MCP shape, carrying the `provenance` it already has. Read tools go through
 * `toMcpPosts` and write tools through `toWrittenMcpPost`, which attach it. User text is sanitized
 * and wrapped as external content, like `read_posts (option search)`. The author of an anonymous post is hidden
 * from every caller, including the author and administrators, so the answer never depends on who
 * asks.
 */
async function toMcpPost(post: Post, details = false): Promise<McpPost> {
  if (details && post.post_type === 'topic_recommendation' && post.topic_recommendation)
    return projectMcpRecommendation(post as TopicRecommendationPost)
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
  const labeled = await attachPostProvenance(posts, null)
  const maskedPosts = maskCommentPlaceholders(labeled, null).map(post => post as Post)
  // Placeholders must not expose links or admit provider work for their hidden content.
  const references = await (details ? getPostHackerNewsDetails : getPostHackerNewsSummaries)(
    maskedPosts.flatMap(post => (post.placeholder_state ? [] : [post.id])),
  )
  return Promise.all(
    maskedPosts.map(async post => {
      return {
        ...(await toMcpPost(post, details)),
        ...(!post.placeholder_state &&
          references[post.id] && { hacker_news_references: references[post.id] }),
      }
    }),
  )
}

/**
 * Maps the post a write tool just wrote, with the same public provenance a read of it returns: the
 * signed-out one, so an anonymous post never names its OAuth client even to its author. The row is
 * read from the primary because it was committed an instant ago.
 */
export async function toWrittenMcpPost(post: Post): Promise<McpPostSummary> {
  return (await toMcpPostSummaries([post], { readOnly: false }))[0]!
}

async function toPostSummary(post: Post): Promise<McpPostSummary> {
  return {
    id: post.id,
    slug: post.slug ?? null,
    post_type: post.post_type,
    title: await sanitizePromptInjection(post.title, { isTitle: true }),
    parent_post_id: post.parent_post_id ?? null,
    root_post_id: post.root_post_id ?? null,
    ...(post.placeholder_state && { placeholder_state: post.placeholder_state }),
  }
}

export async function toMcpPostSummaries(
  posts: Post[],
  options: { readOnly?: boolean } = {},
): Promise<McpPostSummary[]> {
  const masked = maskCommentPlaceholders(posts, null).map(post => post as Post)
  const references = await getPostHackerNewsSummaries(
    masked.flatMap(post => (post.placeholder_state ? [] : [post.id])),
    options,
  )
  return Promise.all(
    masked.map(async post => ({
      ...(await toPostSummary(post)),
      ...(!post.placeholder_state &&
        references[post.id] && { hacker_news_references: references[post.id] }),
    })),
  )
}

/**
 * The posts among `ids` that exist, mapped for MCP, in the order of `ids`. The caller has already
 * decided that each id is readable: this only hydrates, it does not check access.
 */
export async function loadMcpPosts(ids: string[]): Promise<McpPostSummary[]> {
  const posts = await getPostByAnyCachedBatch(ids)
  return toMcpPostSummaries(posts.filter((post): post is Post => Boolean(post)))
}
