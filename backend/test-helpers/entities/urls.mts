/**
 * URLs entity helpers
 */

import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isPublicHostname, normalizeUrlForUrlTable } from '@modules/utils/urls'

type InsertTestUrlDirectOptions = {
  content_type?: string
  preserveHttp?: boolean
}

export type TestViewHostname = {
  __entity_type: 'hostname'
  id: string
  hostname: string
  topic_id: string | null
  blocked: boolean
  crawlable: boolean | null
  skip_web_risk: boolean
  link_rel_follow: boolean | null
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export type TestViewUrl = {
  __entity_type: 'url'
  id: string
  url: string
  pathname: string
  search_params: Record<string, string>
  canonical_url_id: string | null
  hostname: TestViewHostname
}

/**
 * Direct-insert replacement for the real `addUrl` service call: upserts the hostname
 * and URL rows via raw SQL (no web-risk check, crawler auto-creation, cache invalidation,
 * or entity-listener enqueue — those side effects are not exercised by test-helpers
 * consumers) and reads the row back from `view_urls` so callers get the same
 * `ViewUrl`-shaped object (`{ __entity_type, id, url, pathname, search_params,
 * canonical_url_id, hostname }`).
 */
export async function insertTestUrlDirect(
  userId: string | null,
  href: string,
  options: InsertTestUrlDirectOptions = {},
): Promise<TestViewUrl | null> {
  const normalizedUrl = normalizeUrlForUrlTable(href, {
    preserveHttp: options.preserveHttp ?? false,
  })
  if (!isPublicHostname(normalizedUrl.hostname)) return null

  const hostnameResult = await write(sql`/* insertTestUrlDirect */
    INSERT INTO url_hostnames (hostname)
    VALUES (${normalizedUrl.hostname})
    ON CONFLICT (hostname) DO UPDATE SET hostname = EXCLUDED.hostname
    RETURNING id
  `)
  const hostnameId: string = hostnameResult.rows[0].id

  let urlContentTypeId: string | null = null
  if (options.content_type) {
    const mimeType = options.content_type.toLowerCase()
    const contentTypeResult = await write(sql`/* insertTestUrlDirect */
      INSERT INTO url_content_types (mime_type)
      VALUES (${mimeType})
      ON CONFLICT (mime_type) DO UPDATE SET mime_type = EXCLUDED.mime_type
      RETURNING id
    `)
    urlContentTypeId = contentTypeResult.rows[0].id
  }

  const pathname = normalizedUrl.pathname
  const searchParams: Record<string, string> = {}
  normalizedUrl.searchParams.forEach((value: string, key: string) => {
    searchParams[key] = value
  })

  const urlResult = await write(sql`/* insertTestUrlDirect */
    INSERT INTO urls (url, hostname_id, pathname, search_params, created_by_id, url_content_type_id)
    VALUES (
      ${normalizedUrl.toString()}, ${hostnameId}, ${pathname},
      ${JSON.stringify(searchParams)}::jsonb, ${userId}, ${urlContentTypeId}
    )
    ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
    RETURNING id
  `)
  const urlId: string = urlResult.rows[0].id

  const { rows } = await read<TestViewUrl>(
    sql`/* insertTestUrlDirect */ SELECT * FROM view_urls WHERE id = ${urlId}`,
  )
  return rows[0] ?? null
}

/**
 * Insert test URL and return its ID
 */
export async function insertTestUrl(options: {
  url: string
  hostnameId: string
  canonicalUrlId?: string | null
  urlContentTypeId?: string | number | null
}): Promise<string> {
  const { url, hostnameId, canonicalUrlId, urlContentTypeId } = options

  const urlObj = new URL(url)
  const pathname = urlObj.pathname
  const searchParams: Record<string, string> = {}
  urlObj.searchParams.forEach((value, key) => {
    searchParams[key] = value
  })

  let query = sql`/* insertTestUrl */
    INSERT INTO urls (url, hostname_id, pathname, search_params`
  let values = sql`${url}, ${hostnameId}, ${pathname}, ${JSON.stringify(searchParams)}::jsonb`

  if (canonicalUrlId !== undefined) {
    query = query.append(sql`, canonical_url_id`)
    values = values.append(sql`, ${canonicalUrlId}`)
  }
  if (urlContentTypeId !== undefined) {
    query = query.append(sql`, url_content_type_id`)
    values = values.append(sql`, ${urlContentTypeId}`)
  }

  query = query.append(sql`) VALUES (`)
  query = query.append(values)
  query = query.append(sql`) RETURNING id`)

  const result = await write(query)
  return result.rows[0].id
}

/**
 * Hard-delete a URL row by ID (for cache eviction tests)
 */
export async function hardDeleteTestUrl(urlId: string): Promise<void> {
  await write(sql`/* hardDeleteTestUrl */ DELETE FROM urls WHERE id = ${urlId}`)
}

/**
 * Create a test URL with its own unique hostname and return its ID.
 * Useful for canonical URL tests that need isolated URL rows.
 */
export async function createTestUrlWithHostname(): Promise<string> {
  const uid = randomUUID()
  const hostname = `test-${uid.slice(0, 8)}.example.com`
  const hostnameResult = await write(
    sql`/* createTestUrlWithHostname */ INSERT INTO url_hostnames (hostname) VALUES (${hostname}) RETURNING id`,
  )
  const hostnameId: string = hostnameResult.rows[0].id
  return insertTestUrl({ url: `https://${hostname}/path`, hostnameId })
}

/**
 * Create a redirect URL row (with canonical_url_id) and return its URL string.
 * Useful for testing that crawl jobs target the canonical URL, not the redirect.
 */
export async function createTestRedirectUrl(options: {
  canonicalUrlId: string
}): Promise<{ urlString: string }> {
  const { canonicalUrlId } = options
  const uid = randomUUID()
  const hostname = `redirect-${uid.slice(0, 8)}.example.com`
  const hostnameResult = await write(
    sql`/* createTestRedirectUrl */ INSERT INTO url_hostnames (hostname) VALUES (${hostname}) RETURNING id`,
  )
  const hostnameId: string = hostnameResult.rows[0].id
  const urlString = `https://${hostname}/path`
  await insertTestUrl({ url: urlString, hostnameId, canonicalUrlId })
  return { urlString }
}

/**
 * Get the canonical_url_id for a URL row
 */
export async function getTestUrlCanonicalId(urlId: string): Promise<string | null> {
  const result = await read(
    sql`/* getTestUrlCanonicalId */ SELECT canonical_url_id FROM urls WHERE id = ${urlId}`,
  )
  return (result.rows[0]?.canonical_url_id as string | null | undefined) ?? null
}
