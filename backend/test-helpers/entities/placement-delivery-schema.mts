import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestPlacementDeliveryColumns(): Promise<Record<string, string[]>> {
  const { rows } = await read<{ table_name: string; column_name: string }>(sql`
    /* readTestPlacementDeliveryColumns */
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('media_delivery_registry_records', 'media_delivery_repair_markers', 'media_placements')
    ORDER BY table_name, ordinal_position
  `)
  const result: Record<string, string[]> = {}
  for (const row of rows) (result[row.table_name] ??= []).push(row.column_name)
  return result
}

export async function insertTestPlacementRepairKey(deliveryKey: string): Promise<void> {
  await write(sql`/* insertTestPlacementRepairKey */
    INSERT INTO media_delivery_repair_markers (delivery_key, marker_token)
    VALUES (${deliveryKey}, nextval('media_delivery_registry_generation_sequence'))
  `)
}
