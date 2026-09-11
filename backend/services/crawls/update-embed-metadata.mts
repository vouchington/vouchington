import type { UpdateCrawlOptions } from './types.mts'

export function appendEmbedMetadataUpdate(
  setClauses: string[],
  values: unknown[],
  options: Pick<
    UpdateCrawlOptions,
    'embed_metadata' | 'embed_oembed_url' | 'embed_oembed_resolved_at'
  >,
) {
  if (options.embed_metadata !== undefined) {
    setClauses.push(`embed_metadata = $${values.push(JSON.stringify(options.embed_metadata))}`)
  }
  if (options.embed_oembed_url !== undefined) {
    setClauses.push(`embed_oembed_url = $${values.push(options.embed_oembed_url)}`)
  }
  if (options.embed_oembed_resolved_at !== undefined) {
    setClauses.push(`embed_oembed_resolved_at = $${values.push(options.embed_oembed_resolved_at)}`)
  }
}
