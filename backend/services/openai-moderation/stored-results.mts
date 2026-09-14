import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'

export type StoredOpenAIModerationResults =
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | null

export type PersistedOpenAIModerationResults = Exclude<StoredOpenAIModerationResults, null>
export type PersistableOpenAIModerationResults = object | readonly object[]

export type StoredPostOpenAIModeration = {
  flagged: boolean | null
  results: StoredOpenAIModerationResults
}

export async function getStoredPostOpenAIModeration(
  postId: string,
  options?: QueryOptions,
): Promise<StoredPostOpenAIModeration | null> {
  const { rows } = await read<{
    disposition: 'pass' | 'review' | 'reject' | 'incomplete' | null
    evidence: unknown
  }>(
    sql`/* getStoredPostOpenAIModeration */
      SELECT disposition.disposition, disposition.evidence
      FROM posts post
      LEFT JOIN post_moderation_versions version
        ON version.post_id = post.id
       AND version.content_sha256 = post.llm_moderation_content_sha256
       AND version.policy_revision = ${POST_MODERATION_POLICY_REVISION}
      LEFT JOIN LATERAL (
        SELECT disposition, evidence
        FROM post_moderation_dispositions
        WHERE version_id = version.id
          AND source = 'openai_omni'
        ORDER BY id DESC
        LIMIT 1
      ) disposition ON true
      WHERE post.id = ${postId}
        AND post.deleted_at IS NULL
      LIMIT 1
    `,
    options,
  )
  const row = rows[0]
  if (!row) return null
  if (row.disposition === null) return { flagged: null, results: null }
  const evidence = normalizeStoredOpenAIModerationResults(row.evidence)
  const flaggedCategories =
    evidence && !Array.isArray(evidence) && Array.isArray(evidence.flagged_categories)
      ? evidence.flagged_categories.filter((value): value is string => typeof value === 'string')
      : []
  return {
    flagged: row.disposition === 'review' || row.disposition === 'reject',
    results:
      row.disposition === 'incomplete'
        ? null
        : [
            {
              flagged: row.disposition !== 'pass',
              categories: Object.fromEntries(flaggedCategories.map(category => [category, true])),
            },
          ],
  }
}

export function normalizeStoredOpenAIModerationResults(
  value: unknown,
): StoredOpenAIModerationResults {
  if (value === null) return null
  if (Array.isArray(value)) return value.every(isJsonObject) ? value : null
  return isJsonObject(value) ? value : null
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
