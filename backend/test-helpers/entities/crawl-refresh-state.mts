import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type TestCrawlRefreshState = {
  last_crawl_attempt_at: Date | null
  last_successful_crawl_at: Date | null
}

/** Preserve PostgreSQL's full timestamp precision when checking reconciliation revisions. */
export async function readTestUrlReconciliationRevision(urlId: string): Promise<string> {
  const { rows } = await write<{ revision: string }>(sql`/* readTestUrlReconciliationRevision */
    SELECT updated_at::text AS revision FROM urls WHERE id = ${urlId} LIMIT 1
  `)
  const row = rows[0]
  if (!row) throw new Error(`URL not found: ${urlId}`)
  return row.revision
}

/** Read the writer so assertions also observe an uncommitted caller transaction. */
export async function readTestCrawlRefreshState(
  urlId: string,
  options: QueryOptions = {},
): Promise<TestCrawlRefreshState> {
  const { rows } = await write<TestCrawlRefreshState>(
    sql`/* readTestCrawlRefreshState */
    SELECT last_crawl_attempt_at, last_successful_crawl_at
    FROM url_crawl_states WHERE url_id = ${urlId} LIMIT 1
  `,
    undefined,
    options,
  )
  const row = rows[0]
  if (!row) throw new Error(`URL not found: ${urlId}`)
  return row
}

export async function setTestCrawlRefreshState(
  urlId: string,
  state: TestCrawlRefreshState,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* setTestCrawlRefreshState */
    UPDATE url_crawl_states
    SET last_crawl_attempt_at = ${state.last_crawl_attempt_at},
        last_successful_crawl_at = ${state.last_successful_crawl_at}
    WHERE url_id = ${urlId}
  `,
    undefined,
    options,
  )
}

export async function readTestCrawlStateOwner(
  urlId: string,
  options: QueryOptions = {},
): Promise<{ url_id: string; hostname_id: string } | null> {
  const { rows } = await write<{ url_id: string; hostname_id: string }>(
    sql`/* readTestCrawlStateOwner */ SELECT url_id, hostname_id FROM url_crawl_states
      WHERE url_id = ${urlId} LIMIT 1`,
    undefined,
    options,
  )
  return rows[0] ?? null
}

export async function setTestCrawlStateHostname(urlId: string, hostnameId: string): Promise<void> {
  await write(sql`/* setTestCrawlStateHostname */ UPDATE url_crawl_states
    SET hostname_id = ${hostnameId} WHERE url_id = ${urlId}`)
}

export async function moveTestCrawlStateUrl(
  urlId: string,
  hostnameId: string,
  href: string,
): Promise<void> {
  await write(sql`/* moveTestCrawlStateUrl */ UPDATE urls
    SET hostname_id = ${hostnameId}, url = ${href} WHERE id = ${urlId}`)
}

export async function deleteTestCrawlStateUrl(urlId: string): Promise<void> {
  await write(sql`/* deleteTestCrawlStateUrl */ DELETE FROM urls WHERE id = ${urlId}`)
}

export async function insertTestCrawlStateUrl(
  urlId: string,
  hostnameId: string,
  href: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* insertTestCrawlStateUrl */ INSERT INTO urls
    (id, hostname_id, url, search_params) VALUES (${urlId}, ${hostnameId}, ${href}, '{}'::jsonb)`,
    undefined,
    options,
  )
}
