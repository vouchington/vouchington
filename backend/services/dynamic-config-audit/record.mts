import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function recordDynamicConfigChange(
  currentUserId: string,
  configKey: string,
  previousFields: Record<string, unknown>,
  nextFields: Record<string, unknown>,
): Promise<void> {
  await write(sql`/* recordDynamicConfigChange */
    INSERT INTO dynamic_config_change_logs
      (config_key, changed_by_id, previous_fields, next_fields)
    VALUES
      (${configKey}, ${currentUserId}, ${JSON.stringify(previousFields)}, ${JSON.stringify(nextFields)})
  `)
}
