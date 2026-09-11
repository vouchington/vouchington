import type { PrivateUser } from '@voucha/types/entities/user'
import type { PostBroadcast, PostPrivacy, PostType } from '@voucha/types/entities/post'
import { createPost } from './create.mts'
import type { Post, CreatePostInput } from './types.mts'
import {
  createRandomString,
  createTestUser,
  approveTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'

export type CreateTestPostOptions = {
  user?: Readonly<PrivateUser> | null
  title?: string
  slug?: string
  description?: string
  markdown?: string
  post_type?: PostType
  root_id?: string
  parent_id?: string
  url_id?: string
  url?: string
  broadcast?: PostBroadcast
  privacy?: PostPrivacy
  community_id?: string
  is_anonymous?: boolean
  data_point_vertical?: string
  structured_data?: unknown
}

/**
 * Real, full-behavior test-post fixture: goes through the actual `createPost` write
 * path (community/comment authorization, moderation/spam/community-review side
 * effects, entity-listener enqueues). Reserved for fixtures that assert on those
 * side effects; consumers that only need a row should use the raw
 * `createTestPost`/`insertTestPost` helpers in `@voucha/test-helpers` instead, which
 * do not carry this package as a dependency.
 */
export async function createTestPost(options: CreateTestPostOptions = {}) {
  // null-default-ok: createTestPost treats null user as "create a default user".
  const user = options.user || (await createTestUser())
  if (!user) throw new Error('Failed to create test post creator')

  const random = createRandomString(10)
  const post = await createPost(user, {
    title: options.title || `Test Post ${random}`,
    slug: options.slug || `test-post-${random}`,
    markdown: options.markdown || options.description || `Test post description ${random}`,
    post_type: options.post_type || 'discussion',
    root_id: options.root_id,
    parent_id: options.parent_id,
    url_id: options.url_id,
    url: options.url,
    broadcast: options.broadcast,
    privacy: options.privacy,
    is_anonymous: options.is_anonymous,
    community_id: options.community_id,
    data_point_vertical: options.data_point_vertical,
    structured_data: options.structured_data,
  })
  // Test posts bypass the moderation pipeline — approve immediately so
  // they are visible to all users in search/feed queries.
  await approveTestPost(post!.id)
  return post
}

/**
 * Real, full-behavior community-post fixture: goes through the actual `createPost`
 * write path so community authorization/restriction enforcement (ban checks,
 * membership, restriction decisions, archived-community checks) runs for real.
 * Relocated here (from `@voucha/test-helpers`) because that logic cannot be safely
 * reimplemented as raw SQL without changing what tests that assert on it are
 * actually testing — see `@services/communities/restrictions`.
 */
export async function createCommunityPostFixture(
  currentUser: PrivateUser,
  communityId: string,
  attrs?: Partial<CreatePostInput>,
): Promise<Post> {
  const random = createRandomString(8)
  const { community_id: _ignored, ...restAttrs } = attrs ?? {}
  const isComment = restAttrs.post_type === 'comment'
  const post = await createPost(currentUser, {
    post_type: 'discussion',
    title: isComment ? undefined : `Community Post ${random}`,
    markdown: `Community post content ${random}`,
    broadcast: 'everyone',
    privacy: 'public',
    ...(isComment ? {} : { community_id: communityId }),
    ...restAttrs,
  })
  if (!post) throw new Error('Failed to create community post fixture')
  // Auto-approve clearance so the post is visible in anonymous searches,
  // matching the behaviour of insertTestPost (which defaults clearanceStatus to 'approved').
  await setTestPostClearanceStatus(post.id, 'approved', currentUser.id)
  return post
}
