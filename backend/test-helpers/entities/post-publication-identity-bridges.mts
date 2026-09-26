import { beginTransaction, read, write, type TransactionQuery } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import {
  PUBLICATION_IDENTITY_BRIDGES,
  retainPublicationIdentityBridges,
  type PublicationIdentityBridgeFamily,
} from '../../services/post-publication/identity-bridges.mts'

export async function readTestPublicationIdentityBridge(
  family: PublicationIdentityBridgeFamily,
  id: string,
) {
  const { table, liveColumn } = PUBLICATION_IDENTITY_BRIDGES[family]
  const { rows } = await read<{ id: string; live_id: string | null }>(
    `/* readTestPublicationIdentityBridge */ SELECT id, ${liveColumn} AS live_id FROM ${table} WHERE id = $1`,
    [id],
  )
  return rows[0]
}

export async function hardDeleteTestPublicationLiveEntity(
  family: 'post' | 'community' | 'rss_feed_item',
  id: string,
): Promise<void> {
  const { liveTable } = PUBLICATION_IDENTITY_BRIDGES[family]
  await write(`/* hardDeleteTestPublicationLiveEntity */ DELETE FROM ${liveTable} WHERE id = $1`, [
    id,
  ])
}

export async function seedTestUnreferencedPublicationIdentities(count: number): Promise<string[]> {
  const ids = Array.from({ length: count }, () => uuidv7())
  await using query = await beginTransaction()
  await retainPublicationIdentityBridges(query, 'post', ids)
  await query.commit()
  return ids
}

export async function readTestPublicationBridgeTraversalBound(limit: number): Promise<number> {
  const { rows } = await read<{ count: string }>(
    `/* readTestPublicationBridgeTraversalBound */ SELECT SUM(count)::text AS count FROM (
      ${Object.values(PUBLICATION_IDENTITY_BRIDGES)
        .map(({ table }) => `SELECT COUNT(*) AS count FROM ${table}`)
        .join(' UNION ALL ')}
    ) totals`,
  )
  return (
    Math.ceil(Number(rows[0]!.count) / limit) + Object.keys(PUBLICATION_IDENTITY_BRIDGES).length * 2
  )
}

export async function readTestPublicationConcreteSchema() {
  const { rows: columns } = await read<{
    table_name: string
    column_name: string
    is_nullable: string
  }>(
    `/* readTestPublicationConcreteColumns */ SELECT table_name, column_name, is_nullable FROM information_schema.columns
     WHERE table_name IN ('post_publication_dirty_work_keys', 'post_publication_identity_snapshot_keys', 'post_publication_projection_receipts')`,
  )
  const { rows: constraints } = await read<{
    owner: string
    target: string
    delete_action: string
    columns: string[]
  }>(
    `/* readTestPublicationConcreteForeignKeys */ SELECT conrelid::regclass::text AS owner, confrelid::regclass::text AS target,
      confdeltype::text AS delete_action, ARRAY(SELECT attname::text FROM unnest(conkey) n(attnum)
      JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=n.attnum) AS columns
     FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text LIKE 'post_publication_%'`,
  )
  const { rows: receiptIndexes } = await read<{ table_name: string; indexed: boolean }>(
    `/* readTestPublicationReceiptPrimaryIndexes */
    SELECT tree.relid::regclass::text AS table_name, EXISTS (
      SELECT 1 FROM pg_index idx JOIN pg_attribute attribute ON attribute.attrelid=idx.indrelid
      AND attribute.attnum=idx.indkey[0]
      WHERE idx.indrelid=tree.relid AND idx.indisprimary AND idx.indisvalid AND idx.indisready
      AND attribute.attname='post_identity_id'
    ) AS indexed FROM pg_partition_tree('post_publication_projection_receipts'::regclass) tree`,
  )
  return { columns, constraints, receiptIndexes }
}

export async function readTestPublicationAliasStaging(query: TransactionQuery): Promise<number[]> {
  const { rows } = await query<{ oid: number }>(`/* readTestPublicationAliasStaging */
    SELECT oid FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relkind='r' AND relname LIKE 'pub_alias_posts_%'`)
  return rows.map(row => row.oid)
}
export async function countExistingTestPublicationAliasStages(oids: number[]): Promise<number> {
  const { rows } = await read<{ count: string }>(
    `/* countExistingTestPublicationAliasStages */ SELECT COUNT(*)::text AS count FROM pg_class WHERE oid=ANY($1::oid[])`,
    [oids],
  )
  return Number(rows[0]!.count)
}
