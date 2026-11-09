import { write } from '@data-stores/psql'
import { crawlSeedUuid, SEED_PREFIX, seedUuid } from './common.mts'

export const BOILERPLATE_BATCH_HOSTNAME_COUNT = 50
export const BOILERPLATE_BATCH_PATHS_PER_HOSTNAME = 3
const URLS_PER_PATH = 4
/** Sorts just before the first seeded hostname, so a scenario cursor starts the sweep right here. */
export const BOILERPLATE_BATCH_CURSOR = `${SEED_PREFIX}-9a00-7000-8000-000000000000`
const HOSTNAME_TAG = '9a'

/**
 * Seeds the batch only for the scenario and removes it afterwards: other scenarios scan the
 * shared urls corpus and budget their processed rows against its seeded size.
 */
export async function withBoilerplateRemovalBatch(run: () => Promise<void>): Promise<void> {
  try {
    await seedBoilerplateRemovalBatch()
    await run()
  } finally {
    await removeBoilerplateRemovalBatch()
  }
}

async function removeBoilerplateRemovalBatch(): Promise<void> {
  const ids = Array.from({ length: BOILERPLATE_BATCH_HOSTNAME_COUNT }, (_, hostIndex) =>
    seedUuid(hostIndex + 1, HOSTNAME_TAG),
  )
  await write(
    `/* removeBoilerplateRemovalBatch:crawls */ DELETE FROM crawls
     WHERE url_id IN (SELECT id FROM urls WHERE hostname_id = ANY($1::uuid[]))`,
    [ids],
  )
  await write(
    `/* removeBoilerplateRemovalBatch:urls */ DELETE FROM urls WHERE hostname_id = ANY($1::uuid[])`,
    [ids],
  )
  await write(
    `/* removeBoilerplateRemovalBatch:hostnames */ DELETE FROM url_hostnames WHERE id = ANY($1::uuid[])`,
    [ids],
  )
  await write(
    `/* removeBoilerplateRemovalBatch:cursor */ DELETE FROM boilerplate_removal_hostname_cursors`,
  )
}

/** Fifty crawlable hostnames, each with three parent paths of four recently crawled HTML pages. */
async function seedBoilerplateRemovalBatch(): Promise<void> {
  const pagesPerHostname = BOILERPLATE_BATCH_PATHS_PER_HOSTNAME * URLS_PER_PATH
  const rows = Array.from({ length: BOILERPLATE_BATCH_HOSTNAME_COUNT }, (_, hostIndex) =>
    Array.from({ length: pagesPerHostname }, (_unused, pageIndex) => {
      const index = (hostIndex + 1) * 100 + pageIndex
      const hostname = `seed-boilerplate-${hostIndex}.example.com`
      const section = pageIndex % BOILERPLATE_BATCH_PATHS_PER_HOSTNAME
      return {
        hostname_id: seedUuid(hostIndex + 1, HOSTNAME_TAG),
        hostname,
        url_id: seedUuid(index, HOSTNAME_TAG),
        crawl_id: crawlSeedUuid(index, HOSTNAME_TAG),
        url: `https://${hostname}/section-${section}/page-${pageIndex}`,
        pathname: `/section-${section}/page-${pageIndex}`,
      }
    }),
  ).flat()
  const payload = JSON.stringify(rows)
  await write(
    `/* seedBoilerplateRemovalBatch:hostnames */ INSERT INTO url_hostnames
      (id, hostname, is_crawlable, age_threshold_days, crawl_swept_at, publicly_introduced_at)
    SELECT DISTINCT hostname_id, hostname, TRUE, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM jsonb_to_recordset($1::jsonb) AS seed(hostname_id uuid, hostname text)
    ON CONFLICT DO NOTHING`,
    [payload],
  )
  await write(
    `/* seedBoilerplateRemovalBatch:urls */ INSERT INTO urls (id, url, hostname_id, pathname, search_params)
    SELECT url_id, url, hostname_id, pathname, '{}'::jsonb
    FROM jsonb_to_recordset($1::jsonb)
      AS seed(url_id uuid, hostname_id uuid, url text, pathname text)
    ON CONFLICT DO NOTHING`,
    [payload],
  )
  await write(
    `/* seedBoilerplateRemovalBatch:crawls */ INSERT INTO crawls
      (id, url_id, markdown, response_status_code, completed_at, html_sha256,
       html_snapshot_uploaded_at)
    SELECT crawl_id, url_id, '', 200, CURRENT_TIMESTAMP, sha256(url_id::text::bytea),
      CURRENT_TIMESTAMP
    FROM jsonb_to_recordset($1::jsonb) AS seed(crawl_id uuid, url_id uuid)
    ON CONFLICT DO NOTHING`,
    [payload],
  )
  await write(`/* seedBoilerplateRemovalBatch:analyze */ ANALYZE url_hostnames, urls, crawls`)
}
