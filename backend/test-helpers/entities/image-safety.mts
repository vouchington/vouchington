import { write } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function markImageQuarantinePending(imageId: string): Promise<void> {
  await write(sql`
    UPDATE images
    SET quarantine_pending_at = NOW()
    WHERE id = ${imageId}
  `)
}
