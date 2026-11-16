import type { UpdateCrawlOptions } from './types.mts'

/** The `[column, value]` pairs of the embed fields an update sets; `undefined` values are skipped by the caller. */
export function embedMetadataUpdates(
  options: Pick<
    UpdateCrawlOptions,
    'embed_metadata' | 'embed_oembed_url' | 'embed_oembed_resolved_at'
  >,
): [string, unknown][] {
  return [
    [
      'embed_metadata',
      options.embed_metadata === undefined ? undefined : JSON.stringify(options.embed_metadata),
    ],
    ['embed_oembed_url', options.embed_oembed_url],
    ['embed_oembed_resolved_at', options.embed_oembed_resolved_at],
  ]
}
