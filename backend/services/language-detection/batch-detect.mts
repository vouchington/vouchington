import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runBatch } from './batch-helpers.mts'
import { firstVisibleRssTextField } from '@modules/utils/rss-text-fields'

export async function detectPostLanguageBatch(ids: string[]): Promise<{ updated: number }> {
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
  return runBatch({
    table: 'posts',
    rows: rows.map(r => ({
      id: r.id,
      text: [r.title, r.markdown].filter(Boolean).join('\n\n'),
      declaredLanguage: r.declared_language,
      inputSha256: r.lingua_rs_input_sha256,
      title: r.title,
      markdown: r.markdown,
    })),
  })
}

export async function detectRssFeedItemLanguageBatch(ids: string[]): Promise<{ updated: number }> {
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
             WHERE rfis.rss_feed_item_id = rfi.id
               AND rf.deleted_at IS NULL
               AND t.deleted_at IS NULL
               AND t.merged_into_topic_id IS NULL
             ORDER BY
               rf.is_enabled DESC,
               rf.is_discoverable DESC,
               t.votes_score_sort DESC,
               rfis.created_at ASC
             LIMIT 1
           ) AS declared_language
    FROM rss_feed_items rfi
    WHERE rfi.id = ANY(${ids}::uuid[])
      AND rfi.deleted_at IS NULL
  `)
  return runBatch({
    table: 'rss_feed_items',
    rows: rows.map(r => {
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
        data: r.data,
      }
    }),
  })
}

export async function detectCrawlLanguageBatch(ids: string[]): Promise<{ updated: number }> {
  const { rows } = await read<{
    id: string
    title: string | null
    markdown: string
    language: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectCrawlLanguageBatch */
    SELECT id, title, markdown, language, lingua_rs_input_sha256
    FROM crawls
    WHERE id = ANY(${ids}::uuid[])
  `)
  return runBatch({
    table: 'crawls',
    rows: rows.map(r => ({
      id: r.id,
      text: [r.title, r.markdown].filter(Boolean).join('\n\n'),
      declaredLanguage: r.language,
      inputSha256: r.lingua_rs_input_sha256,
      title: r.title,
      markdown: r.markdown,
      language: r.language,
    })),
  })
}
