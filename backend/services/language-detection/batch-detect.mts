import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runBatch } from './batch-helpers.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { firstVisibleRssTextField } from '@modules/utils/rss-text-fields'
import { detectLanguageMany } from './detector.mts'

type BatchDetectDependencies = {
  detectLanguageMany: typeof detectLanguageMany
}

export async function detectPostLanguageBatch(
  ids: string[],
  dependencies?: Partial<BatchDetectDependencies>,
): Promise<{ updated: number }> {
  const { rows } = await read<{
    id: string
    title: string | null
    markdown: string | null
    declared_language: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectPostLanguageBatch */
    SELECT id, title, markdown, declared_language, lingua_rs_input_sha256
    FROM posts
    WHERE id = ANY(${ids}::uuid[])
      AND deleted_at IS NULL
  `)
  return runBatch(
    rows.map(r => ({
      id: r.id,
      text: [r.title, r.markdown].filter(Boolean).join('\n\n'),
      declaredLanguage: r.declared_language,
      inputSha256: r.lingua_rs_input_sha256,
      guard: sql`
        title IS NOT DISTINCT FROM ${r.title}
        AND markdown IS NOT DISTINCT FROM ${r.markdown}
        AND declared_language IS NOT DISTINCT FROM ${r.declared_language}
      `,
    })),
    async (id, lang, contentSha256, inputSha256, results, row) => {
      const update = sql`/* detectPostLanguageBatch:update */
        UPDATE posts SET
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
      await invalidate.posts(id)
    },
    dependencies,
  )
}

export async function detectRssFeedItemLanguageBatch(
  ids: string[],
  dependencies?: Partial<BatchDetectDependencies>,
): Promise<{ updated: number }> {
  const { rows } = await read<{
    id: string
    data: Record<string, unknown>
    lingua_rs_input_sha256: Buffer | null
    declared_language: string | null
  }>(sql`/* detectRssFeedItemLanguageBatch */
    SELECT rfi.id,
           rfi.data,
           rfi.lingua_rs_input_sha256,
           (
             SELECT rf.declared_language
             FROM rss_feed_item_sources rfis
             JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
             JOIN topics t ON t.id = rf.topic_id
             JOIN view_rss_feed_current_states current_state ON current_state.rss_feed_id = rf.id
             WHERE rfis.rss_feed_item_id = rfi.id
               AND rf.deleted_at IS NULL
               AND t.deleted_at IS NULL
               AND t.merged_into_topic_id IS NULL
             ORDER BY
               current_state.is_enabled DESC,
               current_state.is_discoverable DESC,
               t.votes_score_net DESC NULLS LAST,
               rfis.created_at ASC
             LIMIT 1
           ) AS declared_language
    FROM rss_feed_items rfi
    WHERE rfi.id = ANY(${ids}::uuid[])
      AND rfi.deleted_at IS NULL
  `)
  return runBatch(
    rows.map(r => {
      const d = r.data
      const title = typeof d['title'] === 'string' ? d['title'] : ''
      const content = firstVisibleRssTextField([
        d['content:encodedSnippet'],
        d['content:encoded'],
        d['contentSnippet'],
        d['content'],
        d['summary'],
        d['description'],
        d['media:description'],
      ])
      return {
        id: r.id,
        text: [title, content].filter(Boolean).join('\n\n'),
        declaredLanguage: r.declared_language,
        inputSha256: r.lingua_rs_input_sha256,
        guard: sql`
          data IS NOT DISTINCT FROM ${JSON.stringify(r.data)}::jsonb
        `,
      }
    }),
    async (id, lang, contentSha256, inputSha256, results, row) => {
      const update = sql`/* detectRssFeedItemLanguageBatch:update */
        UPDATE rss_feed_items SET
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
      await invalidate.rss_feed_items(id)
    },
    dependencies,
  )
}

export async function detectCrawlLanguageBatch(
  ids: string[],
  dependencies?: Partial<BatchDetectDependencies>,
): Promise<{ updated: number }> {
  const { rows } = await read<{
    id: string
    title: string | null
    markdown: string
    lang: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectCrawlLanguageBatch */
    SELECT id, title, markdown, lang, lingua_rs_input_sha256
    FROM crawls
    WHERE id = ANY(${ids}::uuid[])
  `)
  return runBatch(
    rows.map(r => ({
      id: r.id,
      text: [r.title, r.markdown].filter(Boolean).join('\n\n'),
      declaredLanguage: r.lang,
      inputSha256: r.lingua_rs_input_sha256,
      guard: sql`
        title IS NOT DISTINCT FROM ${r.title}
        AND markdown IS NOT DISTINCT FROM ${r.markdown}
        AND lang IS NOT DISTINCT FROM ${r.lang}
      `,
    })),
    (id, lang, contentSha256, inputSha256, results, row) => {
      const update = sql`/* detectCrawlLanguageBatch:update */
        UPDATE crawls SET
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
