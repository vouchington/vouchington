import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

export const SHARED_LOADER_SOURCE_ID = seedUuid(0, '2b')
export const SHARED_LOADER_DESTINATION_ID = seedUuid(1, '2b')

/** Exercise active, merged and alias branches without changing existing topic fixtures. */
export async function seedSharedLoaders(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedSharedLoaderTopics */ INSERT INTO topics
      (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    VALUES ($1, 'Shared loader source', 'seed-shared-loader-source', 'system', $3),
      ($2, 'Shared loader destination', 'seed-shared-loader-destination', 'system', $4)
    ON CONFLICT (id) DO NOTHING`,
    [
      SHARED_LOADER_SOURCE_ID,
      SHARED_LOADER_DESTINATION_ID,
      contentHash('shared-loader-source'),
      contentHash('shared-loader-destination'),
    ],
  )
  // Create active topics first so their metrics trigger observes a valid reference.
  // The merged fixture keeps no source metrics, matching the merge lifecycle.
  await transaction(
    `/* clearSharedLoaderSourceMetrics */ DELETE FROM topic_metrics WHERE topic_id = $1`,
    [SHARED_LOADER_SOURCE_ID],
  )
  await transaction(
    `/* mergeSharedLoaderSource */ UPDATE topics
    SET merged_into_topic_id = $2, merged_at = now(), merged_by_id = $3
    WHERE id = $1 AND merged_into_topic_id IS NULL`,
    [SHARED_LOADER_SOURCE_ID, SHARED_LOADER_DESTINATION_ID, seedUuid(0, '01')],
  )
  await transaction(
    `/* seedSharedLoaderAlias */ INSERT INTO topic_aliases (topic_id, alias)
    VALUES ($1, 'seed-shared-loader-alias') ON CONFLICT DO NOTHING`,
    [SHARED_LOADER_DESTINATION_ID],
  )
  await transaction.commit()
}
