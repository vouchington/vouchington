import {
  streamEntityReconciliationCandidateBatches,
  type EntityReconciliationCandidate,
} from '@services/entity-listener-reconciliation'
import { bloomRepairSeedWindow } from '../seed-data/bloom-reconciliation.mts'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runBloomReconciliationScenarios(): Promise<void> {
  let first: EntityReconciliationCandidate | undefined
  await runAndCapture('bloom-repair-window', async () => {
    const rows = await collectCandidates(100)
    if (rows.length !== 36) throw new Error('Expected 36 recent Bloom repair candidates')
    first = rows[0]
  })
  await runAndCapture('bloom-repair-capped', async () => {
    if ((await collectCandidates(1)).length !== 1) throw new Error('Expected one capped candidate')
  })
  await runAndCapture('bloom-repair-resumed', async () => {
    const rows = await collectCandidates(1, first)
    if (rows.length !== 1 || rows[0]?.entityId === first?.entityId)
      throw new Error('Expected a new candidate after the retained composite cursor')
  })
}

async function collectCandidates(maxRows: number, after?: EntityReconciliationCandidate) {
  const rows: EntityReconciliationCandidate[] = []
  for await (const batch of streamEntityReconciliationCandidateBatches(bloomRepairSeedWindow(), {
    after,
    limits: { batchSize: 10, maxRows },
  }))
    rows.push(...batch)
  return rows
}

const indexes = [
  'idx_communities__updated_at_id_active',
  'rss_feed_items_default_updated_at_id_idx',
  'idx_api_keys__updated_at_id_active',
  'idx_blocklisted_domains__updated_at_domain_source_id',
  'idx_bedrock_nova_multimodal_v1_embeddings__updated_at_hash',
  'idx_post_slugs__updated_at_post_id_slug',
  'idx_url_hostnames__updated_at_id_blocked',
  'idx_url_hostnames__updated_at_id_not_crawlable',
  'idx_topic_aliases__updated_at_id',
]
const sources = [
  'communities',
  'rss_feed_items',
  'api_keys',
  'blocklisted_domains',
  'bedrock_nova_multimodal_v1_embeddings',
  'post_slugs',
  'url_hostnames',
  'topic_aliases',
]
for (const id of ['bloom-repair-window', 'bloom-repair-capped', 'bloom-repair-resumed']) {
  registerScenarioContract(id, {
    expectations: [
      { kind: 'usesIndexes', indexes },
      ...sources.map(relation => ({
        kind: 'maxProcessedRows' as const,
        relation,
        max: id === 'bloom-repair-window' ? (relation === 'blocklisted_domains' ? 10 : 5) : 3,
      })),
    ],
  })
}
