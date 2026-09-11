import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

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
    openai_omni_moderation_flagged: boolean | null
    openai_omni_moderation_results: unknown
  }>(
    sql`/* getStoredPostOpenAIModeration */
      SELECT openai_omni_moderation_flagged, openai_omni_moderation_results
      FROM posts
      WHERE id = ${postId}
        AND deleted_at IS NULL
      LIMIT 1
    `,
    options,
  )
  const row = rows[0]
  if (!row) return null
  return {
    flagged: row.openai_omni_moderation_flagged,
    results: normalizeStoredOpenAIModerationResults(row.openai_omni_moderation_results),
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
