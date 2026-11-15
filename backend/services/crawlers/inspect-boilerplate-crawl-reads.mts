import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type CrawlId = { id: string }
export type CrawlHead = { url_id: string; id: string | null }
export type CrawlMetadata = CrawlHead & {
  response_status_code: number | null
  completed_at: Date | null
  html_snapshot_uploaded_at: Date | null
  has_html: boolean
}

// Keeping the ordered scans ID-only lets partition-key ordered Append stop without
// sorting a URL's history or priming one metadata tuple from every retained partition.
export async function readBoilerplateCrawlProbes(
  urlIds: string[],
  floor: string,
  queryOptions: QueryOptions = {},
): Promise<CrawlHead[]> {
  const { rows } = await read<CrawlHead>(
    sql`/* readBoilerplateCrawlProbes */
    SELECT selected.url_id, c.id
    FROM unnest(${urlIds}::uuid[]) AS selected(url_id)
    LEFT JOIN LATERAL (
      SELECT crawl.id FROM crawls crawl
      WHERE crawl.url_id = selected.url_id AND crawl.id >= ${floor}::uuid
      ORDER BY crawl.id DESC LIMIT 1
    ) c ON TRUE
    LIMIT ${urlIds.length}
  `,
    undefined,
    queryOptions,
  )
  return rows
}

// Initialize the URL key once: a hot URL's consumed recent IDs must not make a
// custom plan walk other URLs through the id-only primary key.
export async function readBoilerplateCrawlPage(
  urlId: string,
  limit: number,
  floor: string,
  after: string,
  queryOptions: QueryOptions = {},
): Promise<CrawlId[]> {
  const { rows } = await read<CrawlId>(
    sql`/* readBoilerplateCrawlPage */
    SELECT c.id FROM crawls c
    WHERE c.url_id = (SELECT ${urlId}::uuid) AND c.id >= ${floor}::uuid AND c.id < ${after}::uuid
    ORDER BY c.id DESC LIMIT ${limit}
  `,
    undefined,
    queryOptions,
  )
  return rows
}

export async function readBoilerplateCrawlMetadata(
  selected: (CrawlHead & { id: string })[],
  floor: string,
  queryOptions: QueryOptions = {},
): Promise<CrawlMetadata[]> {
  const { rows } = await read<CrawlMetadata>(
    sql`/* readBoilerplateCrawlMetadata */
    SELECT selected.url_id, c.id, c.response_status_code, c.completed_at,
      c.html_snapshot_uploaded_at, c.html_sha256 IS NOT NULL AS has_html
    FROM unnest(${selected.map(crawl => crawl.url_id)}::uuid[],
      ${selected.map(crawl => crawl.id)}::uuid[]) AS selected(url_id, crawl_id)
    LEFT JOIN LATERAL (
      SELECT crawl.id, crawl.response_status_code, crawl.completed_at,
        crawl.html_snapshot_uploaded_at, crawl.html_sha256
      FROM crawls crawl WHERE crawl.id = selected.crawl_id
        AND crawl.url_id = selected.url_id AND crawl.id >= ${floor}::uuid
      LIMIT 1
    ) c ON TRUE
    LIMIT ${selected.length}
  `,
    undefined,
    queryOptions,
  )
  return rows
}
