import { write } from '@data-stores/psql'
import { OEmbedHttpError, type EmbedResolutionPlan } from '@vouchington/embeds'
import { resolveCrawlerOEmbed } from './embed-resolver.mts'
import { getPendingCrawlEmbed } from './get-pending.mts'

export type ResolveCrawlOEmbedResult = 'resolved' | 'skipped'

type ResolveCrawlOEmbedDependencies = {
  resolve(plan: EmbedResolutionPlan): Promise<EmbedResolutionPlan['embed']>
}

const defaultDependencies: ResolveCrawlOEmbedDependencies = {
  resolve: resolveCrawlerOEmbed,
}

/** Enriches and conditionally updates only the crawl row that produced the plan. */
export async function resolveCrawlOEmbed(
  crawlId: string,
  dependencies: ResolveCrawlOEmbedDependencies = defaultDependencies,
): Promise<ResolveCrawlOEmbedResult> {
  const pending = await getPendingCrawlEmbed(crawlId)
  if (!pending) return 'skipped'

  const plan: EmbedResolutionPlan = {
    embed: pending.metadata,
    oEmbedUrl: pending.oEmbedUrl,
  }
  let metadata = pending.metadata
  try {
    metadata = await dependencies.resolve(plan)
  } catch (error) {
    if (!(error instanceof OEmbedHttpError) || (error.status !== 404 && error.status !== 410)) {
      throw error
    }
  }
  const { rowCount } = await write(
    `/* resolveCrawlOEmbed */
    UPDATE crawls
    SET embed_metadata = $1,
        embed_oembed_resolved_at = NOW()
    WHERE id = $2
      AND url_id = $3
      AND embed_oembed_url = $4
      AND embed_oembed_resolved_at IS NULL`,
    [JSON.stringify(metadata), pending.crawlId, pending.urlId, pending.oEmbedUrl],
  )
  return rowCount === 0 ? 'skipped' : 'resolved'
}
