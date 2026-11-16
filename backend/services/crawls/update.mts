import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { UpdateCrawlOptions, CrawlBasic } from './types.mts'
import createError from 'http-errors'
import { enqueueLanguageDetection } from '@queues/content-analysis/enqueues'
import onError from '@modules/on-error'
import { embedMetadataUpdates } from './update-embed-metadata.mts'
import { crawlBasicColumns } from './columns.mts'

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

  const json = (value: unknown) => (value === undefined ? undefined : JSON.stringify(value))
  const provided = (
    [
      ['last_modified_at', options.last_modified_at],
      ['etag', options.etag],
      ['html_sha256', options.html_sha256],
      ['html_snapshot_uploaded_at', options.html_snapshot_uploaded_at],
      ['request_headers', json(options.request_headers)],
      ['response_headers', json(options.response_headers)],
      ['response_status_code', options.response_status_code],
      ['redirect_url_id', options.redirect_url_id],
      ['network_error', options.network_error],
      ['completed_at', options.completed_at],
      ['markdown', options.markdown],
      ['title', options.title],
      ['links', json(options.links)],
      ['meta_tags', json(options.meta_tags)],
      ...embedMetadataUpdates(options),
      ['embeddings_generated_at', options.embeddings_generated_at],
      ['language', options.language],
    ] satisfies [string, unknown][]
  ).filter(([, value]) => value !== undefined)

  if (provided.length === 0) {
    throw createError(422, 'At least one field must be provided for update')
  }

  const setClauses = provided.map(([column], index) => `${column} = $${index + 1}`)
  const values: unknown[] = [...provided.map(([, value]) => value), urlId, crawlId]

  const { rows } = await write<Omit<CrawlBasic, '__entity_type'>>(
    `/* updateCrawl */
    WITH updated AS (
    UPDATE crawls
    SET ${setClauses.join(', ')}
    WHERE url_id = $${values.length - 1}
      AND id = $${values.length}
    RETURNING ${crawlBasicColumns}
    ), recorded_success AS (
      UPDATE url_crawl_states
      SET last_successful_crawl_at = GREATEST(url_crawl_states.last_successful_crawl_at, updated.completed_at)
      FROM updated
      WHERE url_crawl_states.url_id = updated.url_id
        AND updated.completed_at IS NOT NULL
        AND updated.network_error IS NULL
        AND (updated.response_status_code BETWEEN 200 AND 299 OR updated.response_status_code = 304)
        AND (url_crawl_states.last_successful_crawl_at IS NULL OR url_crawl_states.last_successful_crawl_at < updated.completed_at)
    )
    SELECT ${crawlBasicColumns} FROM updated
  `,
    values,
    queryOptions,
  )

  if (rows.length === 0) {
    throw createError(404, `Crawl not found: ${urlId}, ${crawlId}`)
  }

  // Enqueue language detection whenever detector inputs are saved, including
  // clears. The detector writes a "none" result for empty input and deduplicates
  // via its input key, so re-enqueuing is safe. Wait for queue admission before
  // returning; detector execution remains asynchronous.
  if (hasLanguageDetectionInput(options)) {
    await enqueueLanguageDetection('crawl', crawlId).catch(onError)
  }

  return {
    __entity_type: 'crawl',
    ...rows[0],
  }
}

function hasLanguageDetectionInput(
  options: Pick<UpdateCrawlOptions, 'markdown' | 'title' | 'language'>,
): boolean {
  return (
    options.markdown !== undefined || options.title !== undefined || options.language !== undefined
  )
}
