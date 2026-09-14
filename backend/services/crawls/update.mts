import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import type { UpdateCrawlOptions, CrawlBasic } from './types.mts'
import createError from 'http-errors'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import onError from '@modules/on-error'
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

  if (options.last_modified_at !== undefined) {
    setClauses.push(`last_modified_at = $${values.push(options.last_modified_at)}`)
  }
  if (options.etag !== undefined) {
    setClauses.push(`etag = $${values.push(options.etag)}`)
  }
  if (options.html_sha256 !== undefined) {
    setClauses.push(`html_sha256 = $${values.push(options.html_sha256)}`)
  }
  if (options.html_snapshot_uploaded_at !== undefined) {
    setClauses.push(
      `html_snapshot_uploaded_at = $${values.push(options.html_snapshot_uploaded_at)}`,
    )
  }
  if (options.request_headers !== undefined) {
    setClauses.push(`request_headers = $${values.push(JSON.stringify(options.request_headers))}`)
  }
  if (options.response_headers !== undefined) {
    setClauses.push(`response_headers = $${values.push(JSON.stringify(options.response_headers))}`)
  }
  if (options.response_status_code !== undefined) {
    setClauses.push(`response_status_code = $${values.push(options.response_status_code)}`)
  }
  if (options.redirect_url_id !== undefined) {
    setClauses.push(`redirect_url_id = $${values.push(options.redirect_url_id)}`)
  }
  if (options.network_error !== undefined) {
    setClauses.push(`network_error = $${values.push(options.network_error)}`)
  }
  if (options.completed_at !== undefined) {
    setClauses.push(`completed_at = $${values.push(options.completed_at)}`)
  }
  if (options.markdown !== undefined) {
    setClauses.push(`markdown = $${values.push(options.markdown)}`)
  }
  if (options.title !== undefined) {
    setClauses.push(`title = $${values.push(options.title)}`)
  }
  if (options.links !== undefined) {
    setClauses.push(`links = $${values.push(JSON.stringify(options.links))}`)
  }
  if (options.meta_tags !== undefined) {
    setClauses.push(`meta_tags = $${values.push(JSON.stringify(options.meta_tags))}`)
  }
  appendEmbedMetadataUpdate(setClauses, values, options)
  if (options.embeddings_generated_at !== undefined) {
    setClauses.push(`embeddings_generated_at = $${values.push(options.embeddings_generated_at)}`)
  }
  if (options.lang !== undefined) {
    setClauses.push(`lang = $${values.push(options.lang)}`)
  }

  if (setClauses.length === 0) {
    throw createError(422, 'At least one field must be provided for update')
  }

  values.push(urlId)
  values.push(crawlId)

  const { rows } = await write(
    `/* updateCrawl */
    UPDATE crawls
    SET ${setClauses.join(', ')}
    WHERE url_id = $${values.length - 1}
      AND id = $${values.length}
    RETURNING *
  `,
    values,
    queryOptions,
  )

  if (rows.length === 0) {
    throw createError(404, `Crawl not found: ${urlId}, ${crawlId}`)
  }

  // Enqueue language detection whenever detector inputs are saved, including
  // clears. The detector writes a "none" result for empty input and deduplicates
  // via its input key, so re-enqueuing is safe.
  if (hasLanguageDetectionInput(options)) {
    void enqueueLanguageDetection('crawl', crawlId).catch(onError)
  }

  return {
    __entity_type: 'crawl',
    ...rows[0],
  }
}

function hasLanguageDetectionInput(
  options: Pick<UpdateCrawlOptions, 'markdown' | 'title' | 'lang'>,
): boolean {
  return options.markdown !== undefined || options.title !== undefined || options.lang !== undefined
}
