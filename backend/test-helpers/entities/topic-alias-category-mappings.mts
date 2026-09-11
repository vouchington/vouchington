import { read, write } from '@data-stores/psql'

export type TopicAliasCategoryMappingDirtyRowForTest = {
  alias: string
  generation: string
  topic_alias_id: string
}

export async function createTestTopicAliasForCategoryMapping({
  alias,
  topicId = null,
}: {
  alias: string
  topicId?: string | null
}): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* createTestTopicAliasForCategoryMapping */
      INSERT INTO topic_aliases (topic_id, alias)
      VALUES ($1, $2)
      RETURNING id`,
    [topicId, alias],
  )
  return rows[0]!.id
}

export async function updateTestTopicAliasCategoryMappingOwner(
  topicAliasId: string,
  topicId: string | null,
): Promise<void> {
  await write(
    `/* updateTestTopicAliasCategoryMappingOwner */
      UPDATE topic_aliases
      SET topic_id = $1
      WHERE id = $2`,
    [topicId, topicAliasId],
  )
}

export async function deleteTestTopicAliasForCategoryMapping(topicAliasId: string): Promise<void> {
  await write(
    `/* deleteTestTopicAliasForCategoryMapping */
      DELETE FROM topic_aliases
      WHERE id = $1`,
    [topicAliasId],
  )
}

export async function getTopicAliasCategoryMappingDirtyRowForTest(
  topicAliasId: string,
): Promise<TopicAliasCategoryMappingDirtyRowForTest | undefined> {
  const { rows } = await read<TopicAliasCategoryMappingDirtyRowForTest>(
    `/* getTopicAliasCategoryMappingDirtyRowForTest */
      SELECT topic_alias_id, alias, generation
      FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = $1`,
    [topicAliasId],
  )
  return rows[0]
}

export async function prioritizeTopicAliasCategoryMappingDirtyRowForTest(
  topicAliasId: string,
): Promise<void> {
  await write(
    `/* prioritizeTopicAliasCategoryMappingDirtyRowForTest */
      UPDATE topic_alias_category_mapping_reconciliations
      SET updated_at = TIMESTAMPTZ '0001-01-01 00:00:00+00'
      WHERE topic_alias_id = $1`,
    [topicAliasId],
  )
}

export async function acknowledgeTopicAliasCategoryMappingDirtyRowForTest(
  topicAliasId: string,
  generation: string,
): Promise<void> {
  await write(
    `/* acknowledgeTopicAliasCategoryMappingDirtyRowForTest */
      DELETE FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = $1
        AND generation = $2`,
    [topicAliasId, generation],
  )
}

export async function deleteTopicAliasCategoryMappingDirtyRowsForTest(
  topicAliasIds: string[],
): Promise<void> {
  if (topicAliasIds.length === 0) return
  await write(
    `/* deleteTopicAliasCategoryMappingDirtyRowsForTest */
      DELETE FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = ANY($1::uuid[])`,
    [topicAliasIds],
  )
}

export async function createTopicAliasCategoryMappingDirtyRowsForTest(
  rows: Array<{ alias: string; topicAliasId: string }>,
): Promise<void> {
  if (rows.length === 0) return
  await write(
    `/* createTopicAliasCategoryMappingDirtyRowsForTest */
      INSERT INTO topic_alias_category_mapping_reconciliations (topic_alias_id, alias, updated_at)
      SELECT topic_alias_id, alias, TIMESTAMPTZ '0001-01-01 00:00:00+00'
      FROM UNNEST($1::uuid[], $2::text[]) AS input(topic_alias_id, alias)`,
    [rows.map(row => row.topicAliasId), rows.map(row => row.alias)],
  )
}

export async function countTopicAliasCategoryMappingDirtyRowsForTest(
  topicAliasIds: string[],
): Promise<number> {
  if (topicAliasIds.length === 0) return 0
  const { rows } = await read<{ count: string }>(
    `/* countTopicAliasCategoryMappingDirtyRowsForTest */
      SELECT COUNT(*)::text AS count
      FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = ANY($1::uuid[])`,
    [topicAliasIds],
  )
  return Number(rows[0]?.count ?? 0)
}
