import { createPostModerationContent } from '@services/posts/content'
import type { Post } from '@services/posts/types'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createOpenAIModeration } from './request.mts'
import { applyPostOpenAIModerationResults } from './persist-post-results.mts'
import { type PersistedOpenAIModerationResults } from './stored-results.mts'
import type { PostModerationAttempt } from '@services/post-clearance/moderation-ledger'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'

type OpenAIModerationReadOptions = {
  readOnly?: boolean
  dependencies?: Partial<PostOpenAIModerationDependencies>
  attempt?: PostModerationAttempt
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
      options.attempt,
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

  const applied = await applyPostOpenAIModerationResults(
    post.id,
    content_sha256,
    results,
    flagged,
    options.attempt,
  )
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
    FROM posts post
    JOIN post_moderation_versions version
      ON version.post_id = post.id
     AND version.content_sha256 = ${contentSha256}
     AND version.policy_revision = ${POST_MODERATION_POLICY_REVISION}
    JOIN LATERAL (
      SELECT disposition.disposition
      FROM post_moderation_dispositions disposition
      WHERE disposition.version_id = version.id
        AND disposition.source = 'openai_omni'
      ORDER BY disposition.id DESC
      LIMIT 1
    ) latest ON latest.disposition <> 'incomplete'
    WHERE post.id = ${postId}
      AND post.llm_moderation_content_sha256 = ${contentSha256}
  `)

  return rows.length > 0
}

export async function findExistingPostOpenAIModeration(
  contentSha256: Buffer,
  options: OpenAIModerationReadOptions = {},
): Promise<{ results: PersistedOpenAIModerationResults; flagged: boolean } | null> {
  const query = options.readOnly === false ? write : read
  const { rows } = await query(sql`/* findExistingPostOpenAIModeration */
    SELECT disposition.disposition, disposition.evidence
    FROM post_moderation_versions version
    JOIN LATERAL (
      SELECT disposition, evidence, id
      FROM post_moderation_dispositions
      WHERE version_id = version.id
        AND source = 'openai_omni'
        AND disposition <> 'incomplete'
      ORDER BY id DESC
      LIMIT 1
    ) disposition ON true
    WHERE version.content_sha256 = ${contentSha256}
      AND version.policy_revision = ${POST_MODERATION_POLICY_REVISION}
    ORDER BY version.id DESC
    LIMIT 1
  `)

  if (rows.length === 0) {
    return null
  }

  const row = rows[0] as {
    disposition: 'pass' | 'review' | 'reject'
    evidence: { flagged_categories?: unknown }
  }
  const categories = Array.isArray(row.evidence?.flagged_categories)
    ? Object.fromEntries(
        row.evidence.flagged_categories
          .filter((value): value is string => typeof value === 'string')
          .map(value => [value, true]),
      )
    : {}
  const results: PersistedOpenAIModerationResults = [
    { flagged: row.disposition !== 'pass', categories },
  ]
  return {
    results,
    flagged: row.disposition !== 'pass',
  }
}
