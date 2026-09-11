import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { createPostModerationContent, createPostTextEmbeddingContent } from '../content.mts'
import type { Post, UpdatePostChanges } from '../types.mts'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'

export async function writePostUpdates(params: {
  changed: boolean
  contentChanged: boolean
  creatorId: string
  changes: UpdatePostChanges
  options: QueryOptions
  post: Post
}) {
  const { changed, changes, contentChanged, creatorId, options, post } = params
  const hasStructuredDataUpdates = changes.structured_data !== undefined
  if (!contentChanged && !hasStructuredDataUpdates && !changed) return

  const updateQuery = sql`/* updatePost */ UPDATE posts SET updated_by_id = ${creatorId}`
  appendFieldUpdates(updateQuery, post, changes)
  if (contentChanged) appendContentHashes(updateQuery, post, changes)
  updateQuery.append(sql` WHERE id = ${post.id}`)
  await write(updateQuery, options)
}

function appendFieldUpdates(
  updateQuery: ReturnType<typeof sql>,
  post: Post,
  changes: UpdatePostChanges,
) {
  if (changes.markdown !== undefined) updateQuery.append(sql`, markdown = ${changes.markdown}`)
  if (changes.title !== undefined) updateQuery.append(sql`, title = ${changes.title}`)
  if (post.post_type !== 'comment' && changes.broadcast) {
    updateQuery.append(sql`, broadcast = ${changes.broadcast}`)
  }
  if (post.post_type !== 'comment' && changes.privacy) {
    updateQuery.append(sql`, privacy = ${changes.privacy}`)
  }
  if (changes.is_anonymous !== undefined) {
    updateQuery.append(sql`, is_anonymous = ${changes.is_anonymous}`)
  }
  if (changes.structured_data !== undefined) {
    updateQuery.append(sql`, structured_data = ${JSON.stringify(changes.structured_data)}`)
  }
  if (changes.data_point_vertical !== undefined) {
    updateQuery.append(sql`, data_point_vertical = ${changes.data_point_vertical}`)
  }
  if (changes.ai_summary_markdown !== undefined) {
    updateQuery.append(sql`, ai_summary_markdown = ${changes.ai_summary_markdown}`)
  }
  if (changes.declared_language !== undefined) {
    updateQuery.append(
      sql`, declared_language = ${normalizeContentLanguageTag(changes.declared_language ?? null)}`,
    )
  }
}

function appendContentHashes(
  updateQuery: ReturnType<typeof sql>,
  post: Post,
  changes: UpdatePostChanges,
) {
  const newTitle = changes.title ?? post.title
  const newMarkdown = changes.markdown ?? post.markdown
  const newStructuredData = changes.structured_data ?? post.structured_data
  const newAiSummaryMarkdown = changes.ai_summary_markdown ?? post.ai_summary_markdown ?? ''
  const embeddingContentSha = createPostTextEmbeddingContent({
    title: newTitle,
    markdown: newMarkdown,
    structured_data: newStructuredData,
    ai_summary_markdown: newAiSummaryMarkdown,
  }).content_sha256
  const moderationContentSha = createPostModerationContent({
    title: newTitle,
    markdown: newMarkdown,
    ai_summary_markdown: newAiSummaryMarkdown,
    images: post.images ?? [],
    structured_data: newStructuredData,
  }).content_sha256
  updateQuery.append(sql`, bedrock_nova_multimodal_v1_content_sha256 = ${embeddingContentSha}`)
  updateQuery.append(sql`, openai_omni_moderation_content_sha256 = ${moderationContentSha}`)
  updateQuery.append(sql`, llm_moderation_content_sha256 = ${moderationContentSha}`)
}
