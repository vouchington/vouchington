import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '../types.mts'
import type { CreatePostDefaults } from './validation.mts'
import type { PostScope } from './community-scope.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createPostTextEmbeddingContent, createPostModerationContent } from '../content.mts'
import { setPostClearanceStatus } from '@services/post-clearance'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'

export async function insertPost({
  creator,
  defaults,
  isAdminCreator,
  options,
  scope,
  sourceUrlId,
  updates,
}: {
  creator: PrivateUser
  defaults: CreatePostDefaults
  isAdminCreator: boolean
  options: QueryOptions
  scope: PostScope
  sourceUrlId?: string
  updates: CreatePostInput
}) {
  const embeddingContentSha = createPostTextEmbeddingContent(updates).content_sha256
  const moderationContentSha = createPostModerationContent({
    title: updates.title ?? '',
    markdown: updates.markdown ?? '',
    images: updates.images ?? [],
    structured_data: updates.structured_data,
  }).content_sha256
  const { rows } = await write(
    sql`/* createPost */
      INSERT INTO posts (
        post_type, title, markdown, created_by_id, parent_id, root_id, community_id,
        broadcast, privacy, is_anonymous, bedrock_nova_multimodal_v1_content_sha256,
        openai_omni_moderation_content_sha256, llm_moderation_content_sha256,
        data_point_vertical, structured_data, declared_language, url_id, creation_source_url_id
      )
      VALUES (
        ${defaults.postType}, ${updates.title || ''}, ${updates.markdown || ''}, ${creator.id},
        ${scope.parentId}, ${scope.rootId}, ${scope.communityId}, ${defaults.broadcast},
        ${defaults.privacy}, ${defaults.isAnonymous}, ${embeddingContentSha},
        ${moderationContentSha}, ${moderationContentSha}, ${updates.data_point_vertical ?? null},
        ${updates.structured_data != null ? JSON.stringify(updates.structured_data) : null},
        ${normalizeContentLanguageTag(updates.declared_language ?? null)},
        ${defaults.postType === 'link' ? (updates.url_id ?? null) : null}, ${sourceUrlId ?? null}
      )
      RETURNING *
    `,
    options,
  )
  const post = rows[0]
  // Auto-approve bare link posts (no user-authored markdown or images) so the
  // one-click Discuss flow is immediately visible. Link posts with user content
  // (markdown commentary, images) go through the normal moderation queue.
  const isBareLinkPost =
    defaults.postType === 'link' &&
    !updates.markdown?.trim() &&
    (!updates.images || updates.images.length === 0)
  if (isAdminCreator || isBareLinkPost) {
    await setPostClearanceStatus(post.id, 'approved', creator.id, options, {
      creation_moderation_bypassed: isAdminCreator,
    })
  }
  return post
}
