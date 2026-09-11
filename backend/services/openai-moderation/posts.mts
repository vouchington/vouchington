import { createPostModerationContent } from '@services/posts/content'
import type { Post } from '@services/posts/types'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createOpenAIModeration } from './request.mts'
import { applyPostOpenAIModerationResults } from './persist-post-results.mts'
import {
  normalizeStoredOpenAIModerationResults,
  type PersistedOpenAIModerationResults,
} from './stored-results.mts'

type OpenAIModerationReadOptions = {
  readOnly?: boolean
  dependencies?: Partial<PostOpenAIModerationDependencies>
}

type PostOpenAIModerationDependencies = {
  createOpenAIModeration: typeof createOpenAIModeration
}

const defaultDependencies: PostOpenAIModerationDependencies = { createOpenAIModeration }

export async function upsertPostOpenAIModeration(
  post: Post,
  options: OpenAIModerationReadOptions = {},
) {
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const { texts, images_urls, content_sha256 } = createPostModerationContent(post)

  // Skip moderation API call if there's no content to moderate
  if (texts.length === 0 && images_urls.length === 0) {
    return {
      content_sha256,
      skipped: true,
      reason: 'no_content_to_moderate',
    }
  }

  const isUpToDate = await isPostOpenAIModerationUpToDate(post.id, content_sha256, options)
  if (isUpToDate) {
    // moderation already exists and is up to date
    return {
      content_sha256,
    }
  }

  const existing = await findExistingPostOpenAIModeration(content_sha256, options)
  if (existing) {
    const applied = await applyPostOpenAIModerationResults(
      post.id,
      content_sha256,
      existing.results,
      existing.flagged,
    )

    if (!applied) {
      return {
        content_sha256,
        skipped: true,
        reason: 'content_changed',
      }
    }

    return {
      results: existing.results,
      content_sha256,
      reused: true,
      flagged: existing.flagged,
    }
  }

  const results = await dependencies.createOpenAIModeration(texts, images_urls)
  const flagged = results.some(result => result.flagged)

  const applied = await applyPostOpenAIModerationResults(post.id, content_sha256, results, flagged)
  if (!applied) {
    return {
      content_sha256,
      skipped: true,
      reason: 'content_changed',
    }
  }

  return {
    results,
    content_sha256,
    flagged,
  }
}

export async function isPostOpenAIModerationUpToDate(
  postId: string,
  contentSha256: Buffer,
  options: OpenAIModerationReadOptions = {},
): Promise<boolean> {
  const query = options.readOnly === false ? write : read
  const { rows } = await query(sql`/* isPostOpenAIModerationUpToDate */
    SELECT 1
    FROM posts
    WHERE id = ${postId}
      AND (
        openai_omni_moderation_content_sha256 = ${contentSha256}
        AND openai_omni_moderation_input_sha256 = ${contentSha256}
        AND openai_omni_moderation_results IS NOT NULL
        AND openai_omni_moderation_flagged IS NOT NULL
        AND openai_omni_moderation_created_at IS NOT NULL
      )
  `)

  return rows.length > 0
}

export async function findExistingPostOpenAIModeration(
  contentSha256: Buffer,
  options: OpenAIModerationReadOptions = {},
): Promise<{ results: PersistedOpenAIModerationResults; flagged: boolean } | null> {
  const query = options.readOnly === false ? write : read
  const { rows } = await query(sql`/* findExistingPostOpenAIModeration */
    SELECT openai_omni_moderation_results, openai_omni_moderation_flagged
    FROM posts
    WHERE openai_omni_moderation_input_sha256 = ${contentSha256}
      AND openai_omni_moderation_results IS NOT NULL
      AND openai_omni_moderation_flagged IS NOT NULL
    LIMIT 1
  `)

  if (rows.length === 0) {
    return null
  }

  const results = normalizeStoredOpenAIModerationResults(rows[0].openai_omni_moderation_results)
  if (results === null) return null
  return {
    results,
    flagged: rows[0].openai_omni_moderation_flagged,
  }
}
