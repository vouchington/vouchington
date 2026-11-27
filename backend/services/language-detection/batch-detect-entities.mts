import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runBatch } from './batch-helpers.mts'

export async function detectCommunityLanguageBatch(ids: string[]): Promise<{ updated: number }> {
  const { rows } = await read<{
    id: string
    name: string
    markdown: string | null
    default_language: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectCommunityLanguageBatch */
    SELECT id, name, markdown, default_language, lingua_rs_input_sha256
    FROM communities
    WHERE id = ANY(${ids}::uuid[])
      AND deleted_at IS NULL
  `)
  return runBatch({
    table: 'communities',
    rows: rows.map(r => ({
      id: r.id,
      text: [r.name, r.markdown].filter(Boolean).join('\n\n'),
      declaredLanguage: r.default_language,
      inputSha256: r.lingua_rs_input_sha256,
      name: r.name,
      markdown: r.markdown,
      defaultLanguage: r.default_language,
    })),
  })
}

export async function detectUserLanguageBatch(ids: string[]): Promise<{ updated: number }> {
  const { rows } = await read<{
    id: string
    markdown: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectUserLanguageBatch */
    SELECT id, markdown, lingua_rs_input_sha256
    FROM users
    WHERE id = ANY(${ids}::uuid[])
      AND deleted_at IS NULL
      AND markdown IS NOT NULL
      AND markdown != ''
  `)
  return runBatch({
    table: 'users',
    rows: rows.map(r => ({
      id: r.id,
      text: r.markdown ?? '',
      declaredLanguage: null,
      inputSha256: r.lingua_rs_input_sha256,
      markdown: r.markdown,
    })),
  })
}

export async function detectTopicLanguageBatch(ids: string[]): Promise<{ updated: number }> {
  const { rows } = await read<{
    id: string
    name: string
    markdown: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectTopicLanguageBatch */
    SELECT id, name, markdown, lingua_rs_input_sha256
    FROM topics
    WHERE id = ANY(${ids}::uuid[])
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
  `)
  return runBatch({
    table: 'topics',
    rows: rows.map(r => ({
      id: r.id,
      text: [r.name, r.markdown].filter(Boolean).join('\n\n'),
      declaredLanguage: null,
      inputSha256: r.lingua_rs_input_sha256,
      name: r.name,
      markdown: r.markdown,
    })),
  })
}
