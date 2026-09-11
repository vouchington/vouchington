import { enqueueCrawlEmbed } from '@queues/crawl-embeds/enqueues'
import onError from '@modules/on-error'
import { getOEmbedEndpointHostname } from '@services/crawl-embeds/endpoint-hostname'
import type { CrawlBasic, UpdateCrawlOptions } from '../types.mts'
import type { CrawlHtmlFetchResult, CrawlUrlOptions } from './types.mts'

export function getEmbedMetadataUpdate(
  htmlResult: CrawlHtmlFetchResult,
  options: CrawlUrlOptions | undefined,
): Pick<UpdateCrawlOptions, 'embed_metadata' | 'embed_oembed_url' | 'embed_oembed_resolved_at'> {
  if (
    options?.skipEmbedResolution === true ||
    htmlResult.content === undefined ||
    htmlResult.embedMetadata === undefined
  ) {
    return {}
  }
  return {
    embed_metadata: htmlResult.embedMetadata ?? null,
    embed_oembed_url: htmlResult.embedOEmbedUrl ?? null,
    embed_oembed_resolved_at: htmlResult.embedOEmbedUrl ? null : new Date(),
  }
}

export async function enqueuePendingCrawlEmbed(crawl: CrawlBasic) {
  if (!crawl.embed_oembed_url || crawl.embed_oembed_resolved_at) return

  const endpointHostname = getOEmbedEndpointHostname(crawl.embed_oembed_url)
  if (!endpointHostname) {
    onError(new Error(`crawl ${crawl.id} has an invalid oEmbed endpoint`))
    return
  }
  await enqueueCrawlEmbed(crawl.id, {
    endpointHostname,
  })
}
