import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Move one owned concrete slot without changing its placement or activation. */
export async function moveTestImageCapacitySlot(
  placementId: string,
  slotNumber: number,
): Promise<void> {
  const result = await write(sql`/* moveTestImageCapacitySlot */
    UPDATE image_placement_capacity_reservations SET slot_number = ${slotNumber}
    WHERE placement_id = ${placementId}`)
  if (result.rowCount !== 1) throw new Error('Missing owned capacity reservation')
}

export async function readTestImageCapacitySlots(imageId: string): Promise<number[]> {
  const { rows } = await read<{ slot_number: number }>(sql`/* readTestImageCapacitySlots */
    SELECT slot_number FROM image_placement_capacity_reservations WHERE image_id = ${imageId}
    ORDER BY slot_number`)
  return rows.map(row => row.slot_number)
}
