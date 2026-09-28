import type { UpdateCrawlOptions } from './types.mts'

type CrawlColumnUpdate = Pick<
  UpdateCrawlOptions,
  | 'completed_at'
  | 'embeddings_generated_at'
  | 'etag'
  | 'html_sha256'
  | 'html_snapshot_uploaded_at'
  | 'lang'
  | 'last_modified_at'
  | 'markdown'
  | 'meta_tags'
  | 'network_error'
  | 'redirect_url_id'
  | 'request_headers'
  | 'response_headers'
  | 'response_status_code'
  | 'title'
>

export function appendCrawlColumnUpdates(
  setClauses: string[],
  values: unknown[],
  options: CrawlColumnUpdate,
): void {
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
  if (options.meta_tags !== undefined) {
    setClauses.push(`meta_tags = $${values.push(JSON.stringify(options.meta_tags))}`)
  }
  if (options.embeddings_generated_at !== undefined) {
    setClauses.push(`embeddings_generated_at = $${values.push(options.embeddings_generated_at)}`)
  }
  if (options.lang !== undefined) {
    setClauses.push(`lang = $${values.push(options.lang)}`)
  }
}
