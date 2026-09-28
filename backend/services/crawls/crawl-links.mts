import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { CrawlerHtmlStructuredObject, CrawlerHtmlStructuredValue } from './types.mts'

type CrawlLinkWrite = {
  rel: string
  shape: 'string' | 'string_list' | 'map_string' | 'map_string_list'
  subtype: string
  ordinal: number
  href: string
}

function isStringList(value: CrawlerHtmlStructuredValue): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

function isRecord(value: CrawlerHtmlStructuredValue): value is CrawlerHtmlStructuredObject {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function flattenCrawlLinks(links: CrawlerHtmlStructuredObject): CrawlLinkWrite[] {
  const rows: CrawlLinkWrite[] = []
  for (const [rel, value] of Object.entries(links)) {
    if (typeof value === 'string') {
      rows.push({ rel, shape: 'string', subtype: '', ordinal: 0, href: value })
      continue
    }
    if (isStringList(value)) {
      value.forEach((href, ordinal) => {
        rows.push({ rel, shape: 'string_list', subtype: '', ordinal, href })
      })
      continue
    }
    if (!isRecord(value)) {
      throw new TypeError(`Unsupported crawl link shape for ${rel}`)
    }
    for (const [subtype, nested] of Object.entries(value)) {
      if (typeof nested === 'string') {
        rows.push({ rel, shape: 'map_string', subtype, ordinal: 0, href: nested })
        continue
      }
      if (isStringList(nested)) {
        nested.forEach((href, ordinal) => {
          rows.push({ rel, shape: 'map_string_list', subtype, ordinal, href })
        })
        continue
      }
      throw new TypeError(`Unsupported crawl link shape for ${rel}.${subtype}`)
    }
  }
  return rows
}

export async function replaceCrawlLinks(
  crawlId: string,
  links: CrawlerHtmlStructuredObject,
  queryOptions: QueryOptions = {},
): Promise<void> {
  const rows = flattenCrawlLinks(links)
  await write(
    `/* replaceCrawlLinks */
      WITH cleared AS (
        DELETE FROM crawl_links WHERE crawl_id = $1 RETURNING 1
      )
      INSERT INTO crawl_links (crawl_id, rel, shape, subtype, ordinal, href)
      SELECT $1, rel, shape::crawl_link_shapes, subtype, ordinal, href
      FROM UNNEST($2::text[], $3::text[], $4::text[], $5::int[], $6::text[])
        AS input(rel, shape, subtype, ordinal, href)
      CROSS JOIN (SELECT 1 FROM cleared UNION ALL SELECT 1 LIMIT 1) AS sequenced
      ORDER BY rel, subtype, ordinal
    `,
    [
      crawlId,
      rows.map(row => row.rel),
      rows.map(row => row.shape),
      rows.map(row => row.subtype),
      rows.map(row => row.ordinal),
      rows.map(row => row.href),
    ],
    queryOptions,
  )
}
