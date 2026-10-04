import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function recordDynamicConfigChange(
  currentUserId: string,
  configKey: string,
  previousFields: Record<string, unknown>,
  nextFields: Record<string, unknown>,
): Promise<void> {
  await write(sql`/* recordDynamicConfigChange */
    INSERT INTO dynamic_configuration_revisions
      (config_key, revised_by_id, revision_type, changes)
    VALUES
      (${configKey}, ${currentUserId}, 'update', fn_field_changes(${JSON.stringify(previousFields)}::jsonb, ${JSON.stringify(nextFields)}::jsonb))
  `)
}
