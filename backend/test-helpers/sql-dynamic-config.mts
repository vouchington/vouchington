import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function countDynamicConfigAuditRows(configKey: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countDynamicConfigAuditRowsForTest */
    SELECT COUNT(*) AS count
    FROM dynamic_config_change_logs
    WHERE config_key = ${configKey}
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function getDynamicConfigChangeLogRows(configKey: string): Promise<
  Array<{
    config_key: string
    previous_fields: unknown
    next_fields: unknown
    changed_by_id: string
  }>
> {
  const { rows } = await read<{
    config_key: string
    previous_fields: unknown
    next_fields: unknown
    changed_by_id: string
  }>(sql`/* getDynamicConfigChangeLogRowsForTest */
    SELECT config_key, previous_fields, next_fields, changed_by_id
    FROM dynamic_config_change_logs
    WHERE config_key = ${configKey}
    ORDER BY id DESC
  `)
  return rows
}
