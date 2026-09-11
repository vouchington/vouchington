import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markCrawlAsCompletedForSearch(urlId: string, crawlId: string): Promise<void> {
  await write(sql`
    UPDATE crawls
    SET response_status_code = 200,
        completed_at = NOW(),
        network_error = NULL
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)
}

export async function setCrawlNetworkError(
  urlId: string,
  crawlId: string,
  error: 'timeout' | 'dns' | 'ssrf',
): Promise<void> {
  await write(sql`
    UPDATE crawls
    SET response_status_code = 200,
        completed_at = NOW(),
        network_error = ${error}::crawl_network_errors
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)
}

export async function setCrawlStatusCode(
  urlId: string,
  crawlId: string,
  statusCode: number,
): Promise<void> {
  await write(sql`
    UPDATE crawls
    SET response_status_code = ${statusCode},
        completed_at = NOW(),
        network_error = NULL
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)
}

export async function clearCrawlCompletedAt(urlId: string, crawlId: string): Promise<void> {
  await write(sql`
    UPDATE crawls
    SET response_status_code = 200,
        completed_at = NULL,
        network_error = NULL
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)
}

export async function getLatestCrawlNetworkError(urlId: string): Promise<string | null> {
  const { rows } = await read(sql`
    SELECT network_error FROM crawls
    WHERE url_id = ${urlId}
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.network_error ?? null
}

export async function getLatestCrawlStatusCode(urlId: string): Promise<number | null> {
  const { rows } = await read(sql`
    SELECT response_status_code FROM crawls
    WHERE url_id = ${urlId}
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.response_status_code ?? null
}

export type LatestCrawlRedirectStatus = {
  networkError: string | null
  redirectUrlId: string | null
  responseStatusCode: number
}

export async function getLatestCrawlRedirectStatus(
  urlId: string,
): Promise<LatestCrawlRedirectStatus | null> {
  const { rows } = await read(sql`
    SELECT response_status_code, redirect_url_id, network_error
    FROM crawls
    WHERE url_id = ${urlId}
    ORDER BY id DESC
    LIMIT 1
  `)
  if (!rows[0]) return null

  return {
    networkError: rows[0].network_error,
    redirectUrlId: rows[0].redirect_url_id,
    responseStatusCode: rows[0].response_status_code,
  }
}

export async function clearCrawlEmbeddingsGeneratedAt(
  urlId: string,
  crawlId: string,
): Promise<void> {
  await write(sql`
    UPDATE crawls
    SET response_status_code = 200,
        completed_at = NOW(),
        network_error = NULL,
        embeddings_generated_at = NULL
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)
}
