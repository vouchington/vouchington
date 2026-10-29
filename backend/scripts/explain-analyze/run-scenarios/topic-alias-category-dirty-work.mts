import { write } from '@data-stores/psql'
import { getTopicAliasCategoryMappingDirtyRows } from '@services/rss-feeds/topic-alias-category-dirty-state'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runTopicAliasDirtyPageScenario(): Promise<void> {
  const { rows: pendingAliases } = await write<{ id: string }>(
    `/* seedExplainPendingAliasPrefix ids */
     SELECT id FROM topic_aliases
     WHERE alias LIKE 'seed-alias-%' AND alias <> 'seed-alias-0'
       AND topic_id IS NOT NULL AND unlink_requested_at IS NULL
     ORDER BY id LIMIT 1000`,
  )
  if (pendingAliases.length !== 1000) throw new Error('Alias dirty plan needs 1000 pending aliases')
  const ids = pendingAliases.map(row => row.id)
  try {
    await write(
      `/* seedExplainPendingAliasPrefix mark */
       UPDATE topic_aliases SET unlink_topic_id = topic_id, topic_id = NULL,
         unlink_requested_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::uuid[])`,
      [ids],
    )
    await write(`/* seedExplainPendingAliasPrefix analyze */
      ANALYZE topic_alias_category_mapping_reconciliations`)
    registerScenarioContract('topic-alias-category-dirty-page', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_topic_alias_category_mapping_reconciliations__updated_at'],
        },
        {
          kind: 'maxProcessedRows',
          relation: 'topic_alias_category_mapping_reconciliations',
          max: 25,
        },
      ],
      seededRows: { topic_aliases: 2_800, topic_alias_category_mapping_reconciliations: 2500 },
    })
    await runAndCapture('topic-alias-category-dirty-page', async () => {
      const result = await getTopicAliasCategoryMappingDirtyRows(25)
      if (result.length !== 25) throw new Error('Alias dirty page needs 25 ready rows')
      return result
    })
  } finally {
    await write(
      `/* seedExplainPendingAliasPrefix restore */
       UPDATE topic_aliases SET topic_id = unlink_topic_id,
         unlink_topic_id = NULL, unlink_requested_at = NULL
       WHERE id = ANY($1::uuid[])`,
      [ids],
    )
    await write(`/* seedExplainPendingAliasPrefix restoreStats */
      ANALYZE topic_aliases, topic_alias_category_mapping_reconciliations`)
  }
}
