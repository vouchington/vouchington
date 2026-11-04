import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type TestCrawlRefreshState = {
  last_crawl_attempt_at: Date | null
  last_successful_crawl_at: Date | null
}

/** Read the writer so assertions also observe an uncommitted caller transaction. */
export async function readTestCrawlRefreshState(
  urlId: string,
  options: QueryOptions = {},
): Promise<TestCrawlRefreshState> {
  const { rows } = await write<TestCrawlRefreshState>(
    sql`/* readTestCrawlRefreshState */
    SELECT last_crawl_attempt_at, last_successful_crawl_at
    FROM urls WHERE id = ${urlId} LIMIT 1
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
    UPDATE urls
    SET last_crawl_attempt_at = ${state.last_crawl_attempt_at},
        last_successful_crawl_at = ${state.last_successful_crawl_at}
    WHERE id = ${urlId}
  `,
    undefined,
    options,
  )
}
