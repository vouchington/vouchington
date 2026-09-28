import { beginTransaction, write } from '@data-stores/psql'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { UpdateCrawlOptions, CrawlBasic } from './types.mts'
import createError from 'http-errors'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import onError from '@modules/on-error'
import { replaceCrawlLinks } from './crawl-links.mts'
import { appendCrawlColumnUpdates } from './update-columns.mts'
import { appendEmbedMetadataUpdate } from './update-embed-metadata.mts'

export const updateCrawl = async (
  crawlId: string,
  urlId: string,
  options: Omit<UpdateCrawlOptions, 'url_id' | 'created_at'>,
  queryOptions: QueryOptions = {},
): Promise<CrawlBasic> => {
  if (!isUUID(urlId)) {
    throw createError(422, `Invalid URL ID: ${urlId}`)
  }
  if (!isUUID(crawlId)) {
    throw createError(422, `Invalid crawl ID: ${crawlId}`)
  }

  const setClauses: string[] = []
  const values: unknown[] = []
  appendCrawlColumnUpdates(setClauses, values, options)
  appendEmbedMetadataUpdate(setClauses, values, options)

  if (
    setClauses.length === 0 &&
    options.links === undefined &&
    options.embed_metadata === undefined
  ) {
    throw createError(422, 'At least one field must be provided for update')
  }

  const apply = (query: QueryExecutor) =>
    applyCrawlUpdate(crawlId, urlId, options, setClauses, values, { ...queryOptions, query })
  const crawl = queryOptions.query
    ? await apply(queryOptions.query)
    : await commitCrawlUpdate(apply)
  // Enqueue language detection whenever detector inputs are saved, including
  // clears. The detector writes a "none" result for empty input and deduplicates
  // via its input key, so re-enqueuing is safe.
  if (hasLanguageDetectionInput(options)) {
    void enqueueLanguageDetection('crawl', crawlId).catch(onError)
  }
  return crawl
}

async function commitCrawlUpdate(
  apply: (query: QueryExecutor) => Promise<CrawlBasic>,
): Promise<CrawlBasic> {
  await using query = await beginTransaction()
  const crawl = await apply(query)
  await query.commit()
  return crawl
}

async function applyCrawlUpdate(
  crawlId: string,
  urlId: string,
  options: Omit<UpdateCrawlOptions, 'url_id' | 'created_at'>,
  setClauses: string[],
  values: unknown[],
  queryOptions: QueryOptions,
): Promise<CrawlBasic> {
  if (setClauses.length > 0) {
    const updateValues = [...values, urlId, crawlId]
    const { rowCount } = await write(
      `/* updateCrawl */
      UPDATE crawls
      SET ${setClauses.join(', ')}
      WHERE url_id = $${updateValues.length - 1}
        AND id = $${updateValues.length}
    `,
      updateValues,
      queryOptions,
    )
    if ((rowCount ?? 0) === 0) throw createError(404, `Crawl not found: ${urlId}, ${crawlId}`)
  }
  if (options.embed_metadata !== undefined) {
    const { rowCount } = await write(
      `/* updateCrawl:embed */
        WITH target AS (
          SELECT id FROM crawls WHERE id = $1 AND url_id = $3
        )
        SELECT fn_apply_crawl_embed(id, $2::jsonb) FROM target
      `,
      [crawlId, JSON.stringify(options.embed_metadata), urlId],
      queryOptions,
    )
    if ((rowCount ?? 0) === 0) throw createError(404, `Crawl not found: ${urlId}, ${crawlId}`)
  }
  if (options.links !== undefined) {
    await replaceCrawlLinks(crawlId, options.links, queryOptions)
  }
  const crawl = await selectUpdatedCrawl(queryOptions.query!, crawlId, urlId)
  if (!crawl) throw createError(404, `Crawl not found: ${urlId}, ${crawlId}`)
  return crawl
}

async function selectUpdatedCrawl(
  query: QueryExecutor,
  crawlId: string,
  urlId: string,
): Promise<CrawlBasic | null> {
  const { rows } = await query<Omit<CrawlBasic, '__entity_type'>>(
    `/* updateCrawl:select */
      SELECT
        id,
        url_id,
        crawler_id,
        created_at,
        last_modified_at,
        etag,
        html_sha256,
        html_snapshot_uploaded_at,
        request_headers,
        response_headers,
        response_status_code,
        redirect_url_id,
        network_error,
        completed_at,
        embeddings_generated_at,
        has_pending_embeddings,
        markdown,
        title,
        fn_crawl_links_json(id) AS links,
        meta_tags,
        fn_crawl_embed_json(crawls) AS embed_metadata,
        embed_oembed_url,
        embed_oembed_resolved_at,
        lang
      FROM crawls
      WHERE id = $1 AND url_id = $2
      LIMIT 1
    `,
    [crawlId, urlId],
  )
  const row = rows[0]
  if (!row) return null
  return { ...row, __entity_type: 'crawl' }
}

function hasLanguageDetectionInput(
  options: Pick<UpdateCrawlOptions, 'markdown' | 'title' | 'lang'>,
): boolean {
  return options.markdown !== undefined || options.title !== undefined || options.lang !== undefined
}
