import { read } from '@data-stores/psql'

export async function getEntityRelationVoteStorageRows(
  entityRelationIds: string[],
): Promise<Array<{ entity_relation_id: string; storage_table: string }>> {
  const { rows } = await read(
    `/* getEntityRelationVoteStorageRows */ SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__user__category__topic__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__post__category__topic__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__post__category__topic_alias__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__post__related__post__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__post__related__url__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__related__topic__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__category__topic__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__publisher_type__topic__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__faq__post__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__related__post__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__related__url__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__faq__url__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__guide__url__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__landing_page__url__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__topic__terms_of_service__url__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__rss_feed_item__category__topic__votes
          WHERE entity_relation_id = ANY($1::uuid[]) UNION ALL SELECT entity_relation_id, tableoid::regclass::text AS storage_table
          FROM relation__rss_feed_item__category__topic_alias__votes
          WHERE entity_relation_id = ANY($1::uuid[]) ORDER BY entity_relation_id`,
    [entityRelationIds],
  )
  return rows as Array<{ entity_relation_id: string; storage_table: string }>
}
