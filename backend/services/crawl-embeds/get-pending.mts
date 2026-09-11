import { write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import type { ResolvedEmbed } from '@vouchington/embeds'
import createError from 'http-errors'

export interface PendingCrawlEmbed {
  crawlId: string
  metadata: ResolvedEmbed
  oEmbedUrl: string
  urlId: string
}

export async function getPendingCrawlEmbed(crawlId: string): Promise<PendingCrawlEmbed | null> {
  if (!isUUID(crawlId)) throw createError(422, `Invalid crawl ID: ${crawlId}`)
  const { rows } = await write(
    `/* getPendingCrawlEmbed */
    SELECT id, url_id, embed_metadata, embed_oembed_url
    FROM crawls
    WHERE id = $1
      AND embed_metadata IS NOT NULL
      AND embed_oembed_url IS NOT NULL
      AND embed_oembed_resolved_at IS NULL
    LIMIT 1`,
    [crawlId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    crawlId: row.id,
    metadata: row.embed_metadata,
    oEmbedUrl: row.embed_oembed_url,
    urlId: row.url_id,
  }
}
