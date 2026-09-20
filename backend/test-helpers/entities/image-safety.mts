import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markImageQuarantinePending(imageId: string): Promise<void> {
  await write(sql`
    UPDATE images
    SET quarantine_pending_at = NOW()
    WHERE id = ${imageId}
  `)
}
