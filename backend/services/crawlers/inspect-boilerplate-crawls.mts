import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

type UrlInspection = { id: string; eligible: boolean }
type CrawlInspection = {
  id: string
  response_status_code: number
  completed_at: Date | null
  html_snapshot_uploaded_at: Date | null
  has_html: boolean
}

type InspectionResult = {
  eligibleCrawls: { url_id: string; crawl_id: string }[]
  lastUrlId?: string
  crawlAfter?: string
  allUrlsInspected: boolean
}

/** The crawl budget is shared by the whole URL page, including rejected crawls. */
export async function inspectBoilerplateCrawls(
  urls: UrlInspection[],
  limit: number,
  options: { cutoff: Date; floor: string; crawlAfter?: string; queryOptions?: QueryOptions },
): Promise<InspectionResult> {
  const inspectNext = async (
    index: number,
    remaining: number,
    eligibleCrawls: { url_id: string; crawl_id: string }[],
    lastUrlId?: string,
  ): Promise<InspectionResult> => {
    let currentIndex = index
    let lastInspectedUrlId = lastUrlId
    let url = urls[currentIndex]
    if (remaining === 0) return { eligibleCrawls, lastUrlId, allUrlsInspected: !url }
    while (url && !url.eligible) {
      lastInspectedUrlId = url.id
      currentIndex += 1
      url = urls[currentIndex]
    }
    if (!url) {
      return { eligibleCrawls, lastUrlId: lastInspectedUrlId, allUrlsInspected: true }
    }
    const crawls = await readBoilerplateCrawlPage(
      url.id,
      remaining,
      options.floor,
      currentIndex === 0 ? options.crawlAfter : undefined,
      options.queryOptions,
    )
    const cutoff = options.cutoff.getTime()
    const eligible = crawls.find(
      crawl =>
        crawl.response_status_code === 200 &&
        crawl.has_html &&
        crawl.completed_at !== null &&
        crawl.completed_at.getTime() >= cutoff &&
        (crawl.html_snapshot_uploaded_at ?? crawl.completed_at).getTime() >= cutoff,
    )
    if (eligible) eligibleCrawls.push({ url_id: url.id, crawl_id: eligible.id })
    if (!eligible && crawls.length === remaining) {
      return {
        eligibleCrawls,
        lastUrlId: url.id,
        crawlAfter: crawls.at(-1)!.id,
        allUrlsInspected: false,
      }
    }
    return inspectNext(currentIndex + 1, remaining - crawls.length, eligibleCrawls, url.id)
  }
  return inspectNext(0, limit, [])
}

async function readBoilerplateCrawlPage(
  urlId: string,
  limit: number,
  floor: string,
  after: string | undefined,
  queryOptions: QueryOptions = {},
): Promise<CrawlInspection[]> {
  const query = sql`/* readBoilerplateCrawlPage */
    SELECT c.id, c.response_status_code, c.completed_at, c.html_snapshot_uploaded_at,
      c.html_sha256 IS NOT NULL AS has_html
    FROM crawls c
    WHERE c.url_id = ${urlId}::uuid AND c.id >= ${floor}::uuid
  `
  if (after) query.append(sql` AND c.id < ${after}::uuid`)
  query.append(sql` ORDER BY c.id DESC LIMIT ${limit}`)
  const { rows } = await read<CrawlInspection>(query, undefined, queryOptions)
  return rows
}
