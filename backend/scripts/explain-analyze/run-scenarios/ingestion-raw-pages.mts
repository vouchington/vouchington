import assert from 'node:assert/strict'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { seedIngestionAccountId } from '../seed-data/ingestion-raw-pages.mts'
import {
  streamFacebookAccountsToSync,
  streamGithubAccountsToSync,
  streamXAccountsToSync,
} from '@services/friend-recommendations/accounts-to-sync'
import { getStaleBatches } from '@services/bedrock-embeddings-batch/orchestrator/find-stale'

export async function runIngestionRawPageScenarios(): Promise<void> {
  for (const [provider, stream] of [
    ['facebook', streamFacebookAccountsToSync],
    ['x', streamXAccountsToSync],
    ['github', streamGithubAccountsToSync],
  ] as const) {
    for (const [phase, afterId, eligible] of [
      ['sparse', seedIngestionAccountId(0), false],
      ['eligible', seedIngestionAccountId(1000), true],
    ] as const) {
      const scenarioId = `friend-${provider}-${phase}-raw-page`
      registerScenarioContract(scenarioId, {
        expectations: [
          { kind: 'maxProcessedRows', relation: `${provider}_accounts`, max: 121 },
          { kind: 'usesIndexes', indexes: [`${provider}_accounts_pkey`], noSort: true },
        ],
      })
      // no-mistakes-disable-next-line query-reached-per-item: six fixed provider/eligibility cases need separate serialized custom/generic plan captures.
      await runAndCapture(scenarioId, async () => {
        let count = 0
        for await (const row of stream({
          upperId: seedIngestionAccountId(1200),
          afterId,
          sweepStartedAt: new Date().toISOString(),
          limits: { batchSize: 100, maxRows: 100 },
        })) {
          assert.equal(row.eligible, eligible)
          count++
        }
        assert.equal(count, 100)
      })
    }
  }
  for (const [phase, afterId, expectedStale] of [
    ['sparse', seedUuid(0, 'b4'), false],
    ['stale', seedUuid(800, 'b4'), true],
  ] as const) {
    const scenarioId = `bedrock-${phase}-raw-page`
    registerScenarioContract(scenarioId, {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'bedrock_embedding_batches', max: 121 },
        {
          kind: 'usesIndexes',
          indexes: ['idx_bedrock_embedding_batches__active', 'bedrock_embedding_batches_pkey'],
          anyOf: true,
        },
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: two fixed Bedrock lifecycle cases need separate serialized plan captures.
    await runAndCapture(scenarioId, async () => {
      const page = await getStaleBatches(24, {
        afterId,
        throughId: seedUuid(1201, 'b4'),
      })
      assert.equal(page.batches.length > 0, expectedStale)
      if (!expectedStale) assert.equal(page.hasMore, true)
    })
  }
}
