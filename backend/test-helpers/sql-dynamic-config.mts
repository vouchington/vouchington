import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function countDynamicConfigAuditRows(
  configKey: string,
  revisedById?: string,
): Promise<number> {
  const query = sql`/* countDynamicConfigAuditRowsForTest */
    SELECT COUNT(*) AS count
    FROM dynamic_configuration_revisions
    WHERE configuration_key = ${configKey}
  `
  if (revisedById !== undefined) query.append(sql` AND revised_by_id = ${revisedById}`)
  const { rows } = await read<{ count: string }>(query)
  return Number(rows[0]?.count ?? 0)
}

export async function getDynamicConfigChangeLogRows(configKey: string): Promise<
  Array<{
    configuration_key: string
    changes: Record<string, { before: unknown; after: unknown }>
    revised_by_id: string
  }>
> {
  const { rows } = await read<{
    configuration_key: string
    changes: Record<string, { before: unknown; after: unknown }>
    revised_by_id: string
  }>(sql`/* getDynamicConfigChangeLogRowsForTest */
    SELECT configuration_key, changes, revised_by_id
    FROM dynamic_configuration_revisions
    WHERE configuration_key = ${configKey}
    ORDER BY id DESC
  `)
  return rows
}

export async function getDynamicConfigAuditRowId(
  configKey: string,
  revisedById: string,
): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* getDynamicConfigAuditRowIdForTest */
    SELECT id FROM dynamic_configuration_revisions
    WHERE configuration_key = ${configKey} AND revised_by_id = ${revisedById}
    ORDER BY id DESC LIMIT 1
  `)
  if (!rows[0]) throw new Error('Expected an owned dynamic-config audit row')
  return rows[0].id
}
