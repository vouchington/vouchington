import type { QueryOptions } from '@data-stores/psql/types'
import {
  readBoilerplateCrawlProbes,
  readBoilerplateCrawlPage,
  readBoilerplateCrawlMetadata,
  type CrawlHead,
  type CrawlMetadata,
} from './inspect-boilerplate-crawl-reads.mts'

type UrlInspection = { id: string; eligible: boolean }
type InspectionResult = {
  eligibleCrawls: { url_id: string; crawl_id: string }[]
  lastUrlId?: string
  crawlAfter?: string
  crawlProbe?: string
  allUrlsInspected: boolean
}
type InspectionOptions = {
  cutoff: Date
  floor: string
  crawlAfter?: string
  crawlProbe?: string
  queryOptions?: QueryOptions
}

/** ID and metadata reads each consume a raw row; a one-row budget splits them across jobs. */
export async function inspectBoilerplateCrawls(
  urls: UrlInspection[],
  limit: number,
  options: InspectionOptions,
): Promise<InspectionResult> {
  const firstUrl = urls[0]
  if (firstUrl?.eligible && options.crawlProbe) {
    const metadata = await readBoilerplateCrawlMetadata(
      [{ url_id: firstUrl.id, id: options.crawlProbe }],
      options.floor,
      options.queryOptions,
    )
    return settlePendingUrl(urls, [options.crawlProbe], metadata, options.cutoff)
  }
  const idsPerRun = Math.max(1, Math.floor(limit / 2))
  if (firstUrl?.eligible && options.crawlAfter) {
    const ids = await readBoilerplateCrawlPage(
      firstUrl.id,
      idsPerRun,
      options.floor,
      options.crawlAfter,
      options.queryOptions,
    )
    if (ids.length === 0) {
      return { eligibleCrawls: [], lastUrlId: firstUrl.id, allUrlsInspected: urls.length === 1 }
    }
    if (limit === 1) {
      return {
        eligibleCrawls: [],
        lastUrlId: firstUrl.id,
        crawlAfter: options.crawlAfter,
        crawlProbe: ids[0]!.id,
        allUrlsInspected: false,
      }
    }
    const metadata = await readBoilerplateCrawlMetadata(
      ids.map(crawl => ({ url_id: firstUrl.id, id: crawl.id })),
      options.floor,
      options.queryOptions,
    )
    return settlePendingUrl(
      urls,
      ids.map(crawl => crawl.id),
      metadata,
      options.cutoff,
    )
  }

  const probeIds = urls
    .filter(url => url.eligible)
    .slice(0, idsPerRun)
    .map(url => url.id)
  const heads =
    probeIds.length > 0
      ? await readBoilerplateCrawlProbes(probeIds, options.floor, options.queryOptions)
      : []
  const nonemptyHeads = heads.filter((head): head is CrawlHead & { id: string } => head.id !== null)
  const metadata =
    limit > 1 && nonemptyHeads.length > 0
      ? await readBoilerplateCrawlMetadata(nonemptyHeads, options.floor, options.queryOptions)
      : []
  const headsByUrl = new Map(heads.map(head => [head.url_id, head]))
  const metadataByUrl = new Map(metadata.map(crawl => [crawl.url_id, crawl]))
  // Every inspected URL before a stop passed the checks below, so its head id is an eligible crawl.
  const eligibleBefore = (end: number): InspectionResult['eligibleCrawls'] =>
    urls.slice(0, end).flatMap(url => {
      const headId = url.eligible ? headsByUrl.get(url.id)?.id : null
      return headId ? [{ url_id: url.id, crawl_id: headId }] : []
    })
  for (const [index, url] of urls.entries()) {
    if (!url.eligible) continue
    const head = headsByUrl.get(url.id)
    if (!head) {
      return {
        eligibleCrawls: eligibleBefore(index),
        lastUrlId: urls[index - 1]?.id,
        allUrlsInspected: false,
      }
    }
    if (head.id !== null) {
      if (limit === 1) {
        return {
          eligibleCrawls: eligibleBefore(index),
          lastUrlId: url.id,
          crawlProbe: head.id,
          allUrlsInspected: false,
        }
      }
      const crawl = metadataByUrl.get(url.id)
      if (!crawl?.id || !isEligibleCrawl(crawl, options.cutoff)) {
        return {
          eligibleCrawls: eligibleBefore(index),
          lastUrlId: url.id,
          crawlAfter: head.id,
          allUrlsInspected: false,
        }
      }
    }
  }
  return {
    eligibleCrawls: eligibleBefore(urls.length),
    lastUrlId: urls.at(-1)?.id,
    allUrlsInspected: true,
  }
}

function settlePendingUrl(
  urls: UrlInspection[],
  selectedIds: string[],
  metadata: CrawlMetadata[],
  cutoff: Date,
): InspectionResult {
  const metadataById = new Map(metadata.map(crawl => [crawl.id, crawl]))
  const eligible = selectedIds
    .map(id => metadataById.get(id))
    .find(crawl => crawl !== undefined && crawl.id !== null && isEligibleCrawl(crawl, cutoff))
  if (eligible?.id) {
    return {
      eligibleCrawls: [{ url_id: urls[0]!.id, crawl_id: eligible.id }],
      lastUrlId: urls[0]!.id,
      allUrlsInspected: urls.length === 1,
    }
  }
  // A missing/deleted selected row says nothing about older history; continue below its ID.
  return {
    eligibleCrawls: [],
    lastUrlId: urls[0]!.id,
    crawlAfter: selectedIds.at(-1)!,
    allUrlsInspected: false,
  }
}

function isEligibleCrawl(crawl: CrawlMetadata, cutoff: Date): boolean {
  return (
    crawl.response_status_code === 200 &&
    crawl.has_html &&
    crawl.completed_at !== null &&
    crawl.completed_at.getTime() >= cutoff.getTime() &&
    (crawl.html_snapshot_uploaded_at ?? crawl.completed_at).getTime() >= cutoff.getTime()
  )
}
