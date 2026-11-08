import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Probe a row from another connection while the test's delivery transaction remains open. */
export async function isTestMediaPlacementRowLocked(placementId: string): Promise<boolean> {
  try {
    const { rows } = await write(sql`/* isTestMediaPlacementRowLocked */
      SELECT id FROM media_placements WHERE id = ${placementId} FOR UPDATE NOWAIT`)
    if (rows.length !== 1) throw new Error('Test media placement was not found')
    return false
  } catch (err) {
    if ((err as { code?: string }).code === '55P03') return true
    throw err
  }
}

export async function isTestMediaDeliveryKeyLocked(key: string): Promise<boolean> {
  const { rows } = await write<{ acquired: boolean }>(sql`/* isTestMediaDeliveryKeyLocked */
    SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS acquired`)
  return !rows[0]?.acquired
}
