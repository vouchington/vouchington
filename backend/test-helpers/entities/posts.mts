import { read, write } from '@data-stores/psql'
import { insertTestCentralizedEmbeddingsBulk } from './_bedrock-embeddings-support.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import pgvector from 'pgvector/pg'
import { v7 as uuidv7 } from 'uuid'
import { setTestPostClearanceStatus } from './post-clearance.mts'

export async function updatePostEmbeddingData(data: {
  postId: string
  inputSha256: Buffer
  embedding: number[]
  tokens: number
  createdAt?: Date
}): Promise<void> {
  const createdAt = data.createdAt || new Date()
  await insertTestCentralizedEmbeddingsBulk([
    {
      content_sha256: data.inputSha256,
      embedding: data.embedding,
    },
  ])
  await write(sql`
    UPDATE posts
    SET bedrock_nova_multimodal_v1_input_sha256 = ${data.inputSha256},
      bedrock_nova_multimodal_v1_embedding = ${pgvector.toSql(data.embedding)},
      bedrock_nova_multimodal_v1_embedding_created_at = ${createdAt}
    WHERE id = ${data.postId}
  `)
}
export async function updatePostUpdatedAt(postId: string, updatedAt: Date): Promise<void> {
  await write(sql`
    UPDATE posts
    SET updated_at = ${updatedAt}
    WHERE id = ${postId}
  `)
}
export async function getPostEmbeddingData(postId: string): Promise<{
  input_sha: Buffer | null
  created_at: Date | null
  ban_evasion_post_embedding_input_sha: Buffer | null
} | null> {
  const { rows } = await read(sql`
    SELECT
      bedrock_nova_multimodal_v1_input_sha256 AS input_sha,
      bedrock_nova_multimodal_v1_embedding_created_at AS created_at,
      ban_evasion_post_embedding_input_sha256 AS ban_evasion_post_embedding_input_sha
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0] || null
}

export async function insertTestPost(data: {
  id?: string
  title: string
  slug: string
  createdById: string
  markdown: string
  postType?:
    | 'discussion'
    | 'review'
    | 'data_point'
    | 'story'
    | 'topic_recommendation'
    | 'comment'
    | 'article'
    | 'blog_post'
    | 'link'
  urlId?: string
  creationSourceUrlId?: string
  rootId?: string | null
  parentId?: string | null
  communityId?: string | null
  broadcast?: 'everyone' | 'users' | 'followers' | 'mutual_followers'
  privacy?: 'public' | 'private'
  isAnonymous?: boolean
  clearanceStatus?: 'pending' | 'approved' | 'rejected' | 'in_review'
  createdAt?: Date
}): Promise<string> {
  const sha256 = `\\x${'0'.repeat(64)}`
  const id = data.id ?? (data.createdAt ? uuidv7({ msecs: data.createdAt.getTime() }) : null)
  const insertPostQuery = sql`
    INSERT INTO posts (
      id,
      post_type, title, markdown, created_by_id,
      root_id, parent_id, community_id, broadcast, privacy, is_anonymous,
      bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256
  `
  if (data.urlId) insertPostQuery.append(sql`, url_id`)
  if (data.creationSourceUrlId) insertPostQuery.append(sql`, creation_source_url_id`)
  insertPostQuery.append(sql`
    ) VALUES (
      COALESCE(${id}::uuid, uuidv7()),
      ${data.postType || 'discussion'}, ${data.title}, ${data.markdown}, ${data.createdById},
      ${data.rootId === undefined ? null : data.rootId},
      ${data.parentId === undefined ? null : data.parentId},
      ${data.communityId === undefined ? null : data.communityId},
      ${data.broadcast ?? 'everyone'}, ${data.privacy ?? 'public'}, ${data.isAnonymous ?? false},
      ${sha256}, ${sha256}
  `)
  if (data.urlId) insertPostQuery.append(sql`, ${data.urlId}`)
  if (data.creationSourceUrlId) insertPostQuery.append(sql`, ${data.creationSourceUrlId}`)
  insertPostQuery.append(sql`
    )
    RETURNING id
  `)
  const { rows: postRows } = await write(insertPostQuery)
  const postId = postRows[0].id
  const clearanceStatus = data.clearanceStatus ?? 'approved'
  if (clearanceStatus !== 'pending') {
    await setTestPostClearanceStatus(postId, clearanceStatus, data.createdById)
  }
  await write(sql`
    INSERT INTO post_slugs (post_id, slug)
    VALUES (${postId}, ${data.slug})
  `)
  return postId
}
export async function setPostDeclaredLanguage(postId: string, lang: string | null): Promise<void> {
  await write(sql`UPDATE posts SET declared_language = ${lang} WHERE id = ${postId}`)
}

export async function deleteTestPost(postId: string): Promise<void> {
  await write(sql`
    UPDATE posts
    SET deleted_at = NOW()
    WHERE id = ${postId}
  `)
}

export async function getTestPostDeletedAt(postId: string): Promise<Date | null> {
  const { rows } = await read<{ deleted_at: Date | null }>(sql`
    SELECT deleted_at FROM posts WHERE id = ${postId} LIMIT 1
  `)
  return rows[0]?.deleted_at ?? null
}

export async function insertTestPostReview(
  postId: string,
  topicId: string,
  rating = 5,
): Promise<void> {
  await write(sql`
    INSERT INTO post_review_topic_ratings (post_id, topic_id, rating)
    VALUES (${postId}, ${topicId}, ${rating})
  `)
}
/**
 * Directly set votes_score_up on a post (votes_score_net is generated as votes_score_up - votes_score_down)
 */
export async function setPostVotesScoreUp(postId: string, scoreUp: number): Promise<void> {
  await write(sql`
    UPDATE posts
    SET votes_score_up = ${scoreUp}
    WHERE id = ${postId}
  `)
}

export async function updatePostTitleMarkdown(
  postId: string,
  title: string,
  markdown: string,
): Promise<void> {
  await write(sql`
    UPDATE posts
    SET title = ${title},
      markdown = ${markdown}
    WHERE id = ${postId}
  `)
}

export async function setTestPostContentSha(postIds: string[], sha: Buffer): Promise<void> {
  await write(sql`/* setTestPostContentSha */
    UPDATE posts
    SET llm_moderation_content_sha256 = ${sha}
    WHERE id = ANY(${postIds}::uuid[])
  `)
}

export async function getPostIdsByPrivacyFilter(filter: SQLStatement | null): Promise<string[]> {
  const query = sql`/* getPostIdsByPrivacyFilter */ SELECT id FROM posts WHERE`
  if (filter) {
    query.append(sql` `).append(filter)
  } else {
    query.append(sql` TRUE`)
  }
  const { rows } = await read(query)
  return rows.map((r: { id: string }) => r.id)
}
