import { beginTransaction, write } from '@data-stores/psql'
import { getOrCreateCrawlersForHostnames } from '@services/crawlers/get-or-create'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedHostnameIds } from '../run-support.mts'

export async function runCrawlerBatchScenario(): Promise<void> {
  await write(
    `/* explainCrawlerBatchFixture */
    INSERT INTO hostname_crawler_configurations (hostname_id, crawler_type)
    SELECT $1::uuid, 'fetch'::crawler_types
    WHERE NOT EXISTS (
      SELECT 1 FROM hostname_crawler_configurations
      WHERE hostname_id = $1::uuid AND deleted_at IS NULL
    )`,
    [seedHostnameIds[0]!],
  )
  registerScenarioContract('hostname-owner-crawler-batch', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'hostname_crawler_configurations', max: 2 },
    ],
  })
  await runAndCapture(
    'hostname-owner-crawler-batch',
    async () => {
      await using query = await beginTransaction()
      await getOrCreateCrawlersForHostnames(
        null,
        [seedHostnameIds[1]!, seedHostnameIds[0]!, seedHostnameIds[0]!],
        { query },
      )
    },
    undefined,
    ['getOrCreateCrawlersForHostnames:lock', 'getOrCreateCrawlersForHostnames'],
  )
}
