import { write } from '@data-stores/psql'
import {
  dynamicConfigAuditSchema,
  type DynamicConfigAuditFieldType,
} from '@data-stores/psql/dynamic-config-audit-schema'
import sql from 'sql-template-strings'

export async function recordDynamicConfigChange(
  currentUserId: string,
  configKey: string,
  previousFields: Record<string, unknown>,
  nextFields: Record<string, unknown>,
): Promise<void> {
  const schema = dynamicConfigAuditSchema(configKey)
  if (!schema) throw new Error(`Unknown dynamic config namespace: ${configKey}`)

  const columns: string[] = []
  const values: Array<boolean | number | string> = []
  for (const field of schema.fields) {
    if (Object.hasOwn(previousFields, field.name)) {
      columns.push(quotedIdent(field.previous))
      values.push(auditValue(field.name, field.type, previousFields[field.name]))
    }
    if (Object.hasOwn(nextFields, field.name)) {
      columns.push(quotedIdent(field.next))
      values.push(auditValue(field.name, field.type, nextFields[field.name]))
    }
  }
  for (const key of [...Object.keys(previousFields), ...Object.keys(nextFields)]) {
    if (!schema.fields.some(field => field.name === key)) {
      throw new Error(`Unknown dynamic config field: ${key}`)
    }
  }

  const query = sql`/* recordDynamicConfigChange */
    WITH inserted AS (
      INSERT INTO dynamic_config_change_logs (config_key, changed_by_id)
      VALUES (${configKey}, ${currentUserId})
      RETURNING id
    )
    INSERT INTO `
  query.append(schema.table)
  query.append(' (change_id')
  for (const column of columns) query.append(`, ${column}`)
  query.append(') SELECT inserted.id')
  for (const value of values) query.append(sql`, ${value}`)
  query.append(' FROM inserted')
  await write(query)
}

function auditValue(
  name: string,
  type: DynamicConfigAuditFieldType,
  value: unknown,
): boolean | number | string {
  if (type === 'boolean' && typeof value === 'boolean') return value
  if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) return value
  if (type === 'string' && typeof value === 'string') return value
  throw new Error(`Invalid dynamic config value for ${name}`)
}

function quotedIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid dynamic config audit identifier: ${name}`)
  }
  return `"${name}"`
}
