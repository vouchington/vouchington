import type { PrivateUser } from '@voucha/types/entities/user'
import type { PostType } from '@voucha/types/entities/post'
import { makeNearbyEmbedding } from './entities/embedding-vectors.mts'
import {
  addDummyEmbeddingToPost,
  createTestPost,
  setTestPostClearanceStatus,
  type CreateTestPostOptions,
} from './entities/index.mts'

export type McpPostFixture = { label: string; id: string; post_type: PostType }

export type McpPostReadabilityFixtures = {
  /** Public posts every MCP caller can read, so a search that finds them is behaving. */
  readable: McpPostFixture[]
  /** Posts `get_post` answers as not found, even to their author and to administrators. */
  hidden: McpPostFixture[]
}

/**
 * Seeds one author's posts for the MCP read policy: public posts that a search must find and posts
 * an MCP read must refuse. The title and body carry `token`, so a keyword search for it matches
 * every fixture, and each fixture has an embedding near `embedding`, so a semantic or similar
 * search matches every fixture too. Any difference between what a search returns and what the read
 * tools allow therefore comes from the read policy, not from the match.
 */
export async function seedMcpPostReadabilityFixtures(
  author: PrivateUser,
  { token, embedding }: { token: string; embedding: number[] },
): Promise<McpPostReadabilityFixtures> {
  const seed = async (
    label: string,
    options: Omit<CreateTestPostOptions, 'user' | 'title' | 'markdown'> = {},
    pending = false,
  ): Promise<McpPostFixture> => {
    const post = await createTestPost({
      user: author,
      title: `${token} ${label}`,
      markdown: `${token} body of ${label}`,
      ...options,
    })
    await addDummyEmbeddingToPost(post.id, { embedding: makeNearbyEmbedding(embedding) })
    if (pending) await setTestPostClearanceStatus(post.id, 'pending', author.id)
    return { label, id: post.id, post_type: post.post_type }
  }

  const publicRoot = await seed('public root')
  const publicComment = await seed('public comment', {
    post_type: 'comment',
    parent_post_id: publicRoot.id,
  })
  const usersOnly = await seed('users-only post', { privacy: 'private', broadcast: 'users' })
  const followersOnly = await seed('followers-only post', {
    privacy: 'private',
    broadcast: 'followers',
  })
  const mutualOnly = await seed('mutual-followers-only post', {
    privacy: 'private',
    broadcast: 'mutual_followers',
  })
  const pendingPost = await seed('post awaiting review', {}, true)
  const commentUnderPrivate = await seed('comment under a private root', {
    post_type: 'comment',
    parent_post_id: usersOnly.id,
  })
  const pendingComment = await seed(
    'comment awaiting review',
    { post_type: 'comment', parent_post_id: publicRoot.id },
    true,
  )
  const replyUnderPending = await seed('approved reply under a pending comment', {
    post_type: 'comment',
    parent_post_id: pendingComment.id,
  })
  const recommendation = await seed('topic recommendation', { post_type: 'topic_recommendation' })
  const commentUnderRecommendation = await seed('comment under a topic recommendation', {
    post_type: 'comment',
    parent_post_id: recommendation.id,
  })

  return {
    readable: [publicRoot, publicComment],
    hidden: [
      usersOnly,
      followersOnly,
      mutualOnly,
      pendingPost,
      commentUnderPrivate,
      pendingComment,
      replyUnderPending,
      recommendation,
      commentUnderRecommendation,
    ],
  }
}
