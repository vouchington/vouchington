import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runBatch } from './batch-helpers.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { detectLanguageMany } from './detector.mts'

type BatchDetectDependencies = {
  detectLanguageMany: typeof detectLanguageMany
}

export async function detectCommunityLanguageBatch(
  ids: string[],
  dependencies?: Partial<BatchDetectDependencies>,
): Promise<{ updated: number }> {
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
  return runBatch(
    rows.map(r => ({
      id: r.id,
      text: [r.name, r.markdown].filter(Boolean).join('\n\n'),
      declaredLanguage: r.default_language,
      inputSha256: r.lingua_rs_input_sha256,
      guard: sql`
        name IS NOT DISTINCT FROM ${r.name}
        AND markdown IS NOT DISTINCT FROM ${r.markdown}
        AND default_language IS NOT DISTINCT FROM ${r.default_language}
      `,
    })),
    (id, lang, contentSha256, inputSha256, results, row) => {
      const update = sql`/* detectCommunityLanguageBatch:update */
        UPDATE communities SET
          lingua_rs_detected_language = ${lang},
          lingua_rs_content_sha256 = ${contentSha256},
          lingua_rs_input_sha256 = ${inputSha256},
          lingua_rs_results = ${results},
          lingua_rs_detected_at = NOW()
        WHERE id = ${id}
      `
      if (row.guard) {
        update.append(sql` AND `)
        update.append(row.guard)
      }
      return write(update)
    },
    dependencies,
  )
}

export async function detectUserLanguageBatch(
  ids: string[],
  dependencies?: Partial<BatchDetectDependencies>,
): Promise<{ updated: number }> {
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
  return runBatch(
    rows.map(r => ({
      id: r.id,
      text: r.markdown ?? '',
      declaredLanguage: null,
      inputSha256: r.lingua_rs_input_sha256,
      guard: sql`markdown IS NOT DISTINCT FROM ${r.markdown}`,
    })),
    async (id, lang, contentSha256, inputSha256, results, row) => {
      const update = sql`/* detectUserLanguageBatch:update */
        UPDATE users SET
          lingua_rs_detected_language = ${lang},
          lingua_rs_content_sha256 = ${contentSha256},
          lingua_rs_input_sha256 = ${inputSha256},
          lingua_rs_results = ${results},
          lingua_rs_detected_at = NOW()
        WHERE id = ${id}
      `
      if (row.guard) {
        update.append(sql` AND `)
        update.append(row.guard)
      }
      await write(update)
      await invalidate.users(id)
    },
    dependencies,
  )
}

export async function detectTopicLanguageBatch(
  ids: string[],
  dependencies?: Partial<BatchDetectDependencies>,
): Promise<{ updated: number }> {
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
  return runBatch(
    rows.map(r => ({
      id: r.id,
      text: [r.name, r.markdown].filter(Boolean).join('\n\n'),
      declaredLanguage: null,
      inputSha256: r.lingua_rs_input_sha256,
      guard: sql`
        name IS NOT DISTINCT FROM ${r.name}
        AND markdown IS NOT DISTINCT FROM ${r.markdown}
      `,
    })),
    async (id, lang, contentSha256, inputSha256, results, row) => {
      const update = sql`/* detectTopicLanguageBatch:update */
        UPDATE topics SET
          lingua_rs_detected_language = ${lang},
          lingua_rs_content_sha256 = ${contentSha256},
          lingua_rs_input_sha256 = ${inputSha256},
          lingua_rs_results = ${results},
          lingua_rs_detected_at = NOW()
        WHERE id = ${id}
      `
      if (row.guard) {
        update.append(sql` AND `)
        update.append(row.guard)
      }
      await write(update)
      await invalidate.topics(id)
    },
    dependencies,
  )
}
