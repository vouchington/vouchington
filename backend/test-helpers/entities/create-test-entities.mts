import type { PrivateUser } from '@voucha/types/entities/user'
import type { PostBroadcast, PostPrivacy, PostType } from '@voucha/types/entities/post'
import type { TopicTypes } from '@voucha/types/entities/topic'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestTopic } from './topics.mts'
import { insertTestUrlHostname } from './url-hostnames.mts'
import { insertTestUrlDirect } from './urls.mts'
import { insertTestPost } from './posts.mts'
import { createRandomString } from '../data.mts'
import { createTestUser } from './users.mts'

export type CreateTestTopicOptions = {
  user?: Readonly<PrivateUser> | null
  name?: string
  slug?: string
  description?: string
  markdown?: string
  topic_type?: TopicTypes
  hostname?: string | null
}

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

// Duplicates the topics domain's setTopicHostnameLink UPDATE pair so test-helpers does not depend
// on that service package, which would otherwise create a workspace dependency cycle (every backend
// service devDeps test-helpers for its tests). Skips the real service's validation/clear-prior-link
// steps: fixture callers always pass a freshly created topic + freshly created hostname, which never
// has a pre-existing link to clear, so those steps are no-ops for every current call site.
export async function setTestTopicHostnameLink(topicId: string, hostnameId: string): Promise<void> {
  await write(
    sql`/* setTestTopicHostnameLink */ UPDATE topics SET hostname_id = ${hostnameId}::uuid WHERE id = ${topicId}`,
  )
  await write(
    sql`/* setTestTopicHostnameLink */ UPDATE url_hostnames SET topic_id = ${topicId} WHERE id = ${hostnameId}::uuid`,
  )
}

export async function createTestTopic(options: CreateTestTopicOptions = {}) {
  const random = createRandomString(10)
  const name = options.name || `Test Topic ${random}`
  const slug = options.slug || `test-topic-${random}`

  let createdById: string
  if (options.user) {
    createdById = options.user.id
  } else {
    const admin = await createTestUser({ administrator: true })
    if (!admin) throw new Error('Failed to create test topic creator')
    createdById = admin.id
  }

  const id = await insertTestTopic({ name, slug, createdById, topicType: options.topic_type })
  if (options.hostname !== undefined && options.hostname !== null) {
    const hostnameId = await insertTestUrlHostname({
      hostname: options.hostname,
    })
    await setTestTopicHostnameLink(id, hostnameId)
  }
  return { id, name, slug }
}

// Raw-SQL fixture: writes a post row directly (via insertTestPost) instead of going
// through the real @services/posts/create write path, so test-helpers does not depend
// on that service package (every backend service devDeps test-helpers for its tests,
// so a test-helpers -> @services/posts edge is a workspace cycle). Deliberately does
// not replicate @services/posts' community/comment authorization, moderation/spam
// side effects, or entity-listener enqueues — fixtures that assert on that genuine
// behavior must use the real createTestPost from `@services/posts/test-support`
// instead (see backend/test-helpers/README.md).
export async function createTestPost(options: CreateTestPostOptions = {}) {
  // null-default-ok: createTestPost treats null user as "create a default user".
  const user = options.user || (await createTestUser())
  if (!user) throw new Error('Failed to create test post creator')

  const random = createRandomString(10)

  let urlId = options.url_id
  if (!urlId && options.url) {
    const url = await insertTestUrlDirect(user.id, options.url)
    urlId = url ? (url.canonical_url_id ?? url.id) : undefined
  }

  // Comments (and other posts that thread off a parent) inherit the parent's root_id,
  // falling back to the parent itself for top-level replies — mirrors
  // @services/posts/create/comment-scope.mts's `parent.root_id ?? parent.id` derivation.
  let rootId = options.root_id
  if (!rootId && options.parent_id) {
    const { rows } = await read<{ root_id: string | null }>(sql`/* createTestPost */
      SELECT root_id FROM posts WHERE id = ${options.parent_id}
    `)
    rootId = rows[0]?.root_id ?? options.parent_id
  }

  const postId = await insertTestPost({
    title: options.title || `Test Post ${random}`,
    slug: options.slug || `test-post-${random}`,
    markdown: options.markdown || options.description || `Test post description ${random}`,
    postType: options.post_type || 'discussion',
    createdById: user.id,
    rootId,
    parentId: options.parent_id,
    communityId: options.community_id,
    urlId,
    broadcast: options.broadcast,
    privacy: options.privacy,
    isAnonymous: options.is_anonymous,
    // Test posts bypass the moderation pipeline — approve immediately so they are
    // visible to all users in search/feed queries (insertTestPost defaults to this).
  })

  if (options.data_point_vertical !== undefined || options.structured_data !== undefined) {
    await write(sql`/* createTestPost */
      UPDATE posts
      SET data_point_vertical = ${options.data_point_vertical ?? null},
        structured_data = ${
          options.structured_data === undefined ? null : JSON.stringify(options.structured_data)
        }::jsonb
      WHERE id = ${postId}
    `)
  }

  const { rows } = await read(
    sql`/* createTestPost */ SELECT * FROM view_posts WHERE id = ${postId}`,
  )
  return rows[0]
}
