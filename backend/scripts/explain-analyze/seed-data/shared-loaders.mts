import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

export const SHARED_LOADER_SOURCE_ID = seedUuid(0, '2b')
export const SHARED_LOADER_DESTINATION_ID = seedUuid(1, '2b')

/** Exercise active, merged and alias branches without changing existing topic fixtures. */
export async function seedSharedLoaders(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedSharedLoaderTopics */ INSERT INTO topics
      (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256,
        merged_into_topic_id, merged_at, merged_by_id)
    VALUES ($1, 'Shared loader source', 'seed-shared-loader-source', 'system', $3, $2, now(), $5),
      ($2, 'Shared loader destination', 'seed-shared-loader-destination', 'system', $4, NULL, NULL, NULL)
    ON CONFLICT (id) DO NOTHING`,
    [
      SHARED_LOADER_SOURCE_ID,
      SHARED_LOADER_DESTINATION_ID,
      contentHash('shared-loader-source'),
      contentHash('shared-loader-destination'),
      seedUuid(0, '01'),
    ],
  )
  await transaction(
    `/* seedSharedLoaderAlias */ INSERT INTO topic_aliases (topic_id, alias)
    VALUES ($1, 'seed-shared-loader-alias') ON CONFLICT DO NOTHING`,
    [SHARED_LOADER_DESTINATION_ID],
  )
  await transaction.commit()
}
