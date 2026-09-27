import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertLanguageDetectionPostForTest(params: {
  createdById: string
  title: string
  markdown: string
  declaredLanguage?: string
  inputSha256?: Buffer
  deleted?: boolean
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionPostForTest */
    INSERT INTO posts (
      post_type, title, markdown, declared_language, created_by_id, broadcast, privacy, is_anonymous,
      bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256,
      lingua_rs_input_sha256,
      deleted_at
    ) VALUES (
      'discussion',
      ${params.title},
      ${params.markdown},
      ${params.declaredLanguage ?? null},
      ${params.createdById},
      'everyone', 'public', false,
      ${`\\x${'0'.repeat(64)}`},
      ${`\\x${'0'.repeat(64)}`},
      ${params.inputSha256 ?? null},
      ${params.deleted ? new Date() : null}
    )
    RETURNING id
  `)
  return rows[0]!.id
}

export async function insertLanguageDetectionCommunityForTest(params: {
  createdById: string
  name: string
  slug: string
  defaultLanguage?: string
  inputSha256?: Buffer
  deleted?: boolean
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionCommunityForTest */
    INSERT INTO communities (
      name, slug, visibility, member_roster_visibility, created_by_id, default_language,
      lingua_rs_input_sha256, deleted_at
    )
    VALUES (
      ${params.name},
      ${params.slug},
      'public',
      'public',
      ${params.createdById},
      ${params.defaultLanguage ?? null},
      ${params.inputSha256 ?? null},
      ${params.deleted ? new Date() : null}
    )
    RETURNING id
  `)
  return rows[0]!.id
}

export async function insertLanguageDetectionUserForTest(params: {
  username: string
  markdown?: string
  inputSha256?: Buffer
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionUserForTest */
    INSERT INTO users (username, markdown, lingua_rs_input_sha256)
    VALUES (${params.username}, ${params.markdown ?? ''}, ${params.inputSha256 ?? null})
    RETURNING id
  `)
  return rows[0]!.id
}

export async function updateUserMarkdownForLanguageDetectionForTest(
  userId: string,
  markdown: string,
): Promise<string> {
  const { rows } = await write<{
    id: string
  }>(sql`/* updateUserMarkdownForLanguageDetectionForTest */
    UPDATE users SET markdown = ${markdown}
    WHERE id = ${userId}
    RETURNING id
  `)
  return rows[0]!.id
}

export async function insertLanguageDetectionTopicForTest(params: {
  createdById: string
  name: string
  slug: string
  inputSha256?: Buffer
  deleted?: boolean
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionTopicForTest */
    INSERT INTO topics (
      name, slug, created_by_id, topic_type, noindex, allow_reviews,
      bedrock_nova_multimodal_v1_content_sha256, lingua_rs_input_sha256, deleted_at
    )
    VALUES (
      ${params.name},
      ${params.slug},
      ${params.createdById},
      'topic',
      false,
      true,
      ${`\\x${'0'.repeat(64)}`},
      ${params.inputSha256 ?? null},
      ${params.deleted ? new Date() : null}
    )
    RETURNING id
  `)
  const topicId = rows[0]!.id
  await write(sql`/* insertLanguageDetectionTopicMetricsForTest */
    INSERT INTO topic_metrics (topic_id) VALUES (${topicId}) ON CONFLICT DO NOTHING
  `)
  return topicId
}

export async function insertLanguageDetectionCrawlForTest(params: {
  hostname: string
  url: string
  markdown: string
  title?: string
  lang?: string
  inputSha256?: Buffer
}): Promise<string> {
  const hostnameResult = await write<{
    id: string
  }>(sql`/* insertLanguageDetectionCrawlHostnameForTest */
    INSERT INTO url_hostnames (hostname)
    VALUES (${params.hostname})
    ON CONFLICT (hostname) DO UPDATE SET hostname = EXCLUDED.hostname
    RETURNING id
  `)
  const hostnameId = hostnameResult.rows[0]!.id
  const urlResult = await write<{ id: string }>(sql`/* insertLanguageDetectionCrawlUrlForTest */
    INSERT INTO urls (url, hostname_id, pathname)
    VALUES (${params.url}, ${hostnameId}, ${'/page'})
    RETURNING id
  `)
  const { rows } = await write<{ id: string }>(sql`/* insertLanguageDetectionCrawlForTest */
    INSERT INTO crawls (
      url_id, response_status_code, title, lang, markdown, completed_at, embeddings_generated_at,
      network_error, lingua_rs_input_sha256
    )
    VALUES (
      ${urlResult.rows[0]!.id},
      200,
      ${params.title ?? null},
      ${params.lang ?? null},
      ${params.markdown},
      NOW(),
      NOW(),
      NULL,
      ${params.inputSha256 ?? null}
    )
    RETURNING id
  `)
  return rows[0]!.id
}
