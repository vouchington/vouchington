import { CONTRIBUTION_LIMIT_FIELDS_A } from './dynamic-config-audit-fields-limits-a.mts'
import { CONTRIBUTION_LIMIT_FIELDS_B } from './dynamic-config-audit-fields-limits-b.mts'
import { DYNAMIC_CONFIG_AUDIT_FIELDS_CORE } from './dynamic-config-audit-fields-core.mts'
import { DYNAMIC_CONFIG_AUDIT_FIELDS_REST } from './dynamic-config-audit-fields-rest.mts'
// Typed previous/next columns for every registered dynamic config namespace.
// Field names and types are checked against the admin registry by
// backend/services/dynamic-config-admin/registry-audit-schema.test.mts.

export type DynamicConfigAuditFieldType = 'boolean' | 'number' | 'string'

export const DYNAMIC_CONFIG_AUDIT_FIELD_TYPES = {
  ...DYNAMIC_CONFIG_AUDIT_FIELDS_CORE,
  'contribution-rate-limits': {
    ...CONTRIBUTION_LIMIT_FIELDS_A,
    ...CONTRIBUTION_LIMIT_FIELDS_B,
  },
  ...DYNAMIC_CONFIG_AUDIT_FIELDS_REST,
} as const

export type DynamicConfigAuditNamespace = keyof typeof DYNAMIC_CONFIG_AUDIT_FIELD_TYPES

export type DynamicConfigAuditField = {
  name: string
  type: DynamicConfigAuditFieldType
  previous: string
  next: string
}

export type DynamicConfigAuditSchema = {
  namespace: DynamicConfigAuditNamespace
  table: string
  fields: DynamicConfigAuditField[]
}

const SQL_TYPE = {
  boolean: 'BOOLEAN',
  number: 'DOUBLE PRECISION',
  string: 'TEXT',
} as const

const INTEGER_MONEY_FIELD = /_(?:minor_units|microunits)(?:_per_[a-z0-9_]+)?$/

function columnSqlType(field: DynamicConfigAuditField): string {
  if (field.type === 'number' && INTEGER_MONEY_FIELD.test(field.name)) return 'BIGINT'
  return SQL_TYPE[field.type]
}

function storesIntegerMoney(schema: DynamicConfigAuditSchema): boolean {
  return schema.fields.some(field => INTEGER_MONEY_FIELD.test(field.name))
}

export function dynamicConfigAuditTable(namespace: string): string {
  const table = `dynamic_config_audit_${namespace.replaceAll('-', '_')}_facts`
  if (!/^[a-z0-9_]+$/.test(table)) throw new Error(`Invalid dynamic config audit table: ${table}`)
  return table
}

function auditColumnName(side: 'previous' | 'next', field: string): string {
  const name = `${side}_${field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`
  if (!/^[a-z][a-z0-9_]*$/.test(name) || name.length > 63) {
    throw new Error(`Invalid dynamic config audit column: ${name}`)
  }
  return name
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.length > 63) {
    throw new Error(`Invalid dynamic config audit identifier: ${name}`)
  }
  return `"${name}"`
}

export function dynamicConfigAuditSchemas(): DynamicConfigAuditSchema[] {
  return Object.entries(DYNAMIC_CONFIG_AUDIT_FIELD_TYPES).map(([namespace, fieldTypes]) => ({
    namespace: namespace as DynamicConfigAuditNamespace,
    table: dynamicConfigAuditTable(namespace),
    fields: Object.entries(fieldTypes).map(([name, type]) => ({
      name,
      type: type as DynamicConfigAuditFieldType,
      previous: auditColumnName('previous', name),
      next: auditColumnName('next', name),
    })),
  }))
}

export const DYNAMIC_CONFIG_AUDIT_TABLES = Object.keys(DYNAMIC_CONFIG_AUDIT_FIELD_TYPES).map(
  namespace => dynamicConfigAuditTable(namespace),
)

export function dynamicConfigAuditSchema(namespace: string): DynamicConfigAuditSchema | undefined {
  return dynamicConfigAuditSchemas().find(schema => schema.namespace === namespace)
}

export function renderAuditTable(schema: DynamicConfigAuditSchema): string {
  const columns = schema.fields.flatMap(field => [
    `${quoteIdent(field.previous)} ${columnSqlType(field)}`,
    `${quoteIdent(field.next)} ${columnSqlType(field)}`,
  ])
  if (storesIntegerMoney(schema)) {
    columns.push(`currency_code TEXT NOT NULL DEFAULT 'USD'`)
  }
  const comments = [
    `COMMENT ON TABLE ${schema.table} IS 'Typed previous and next values for ${schema.namespace} dynamic config audits.';`,
    `COMMENT ON COLUMN ${schema.table}.change_id IS 'Dynamic config audit row these field values belong to.';`,
    ...schema.fields.flatMap(field => [
      `COMMENT ON COLUMN ${schema.table}.${quoteIdent(field.previous)} IS 'Previous ${field.name} value; null when the audited snapshot omitted that key.';`,
      `COMMENT ON COLUMN ${schema.table}.${quoteIdent(field.next)} IS 'Next ${field.name} value; null when the audited snapshot omitted that key.';`,
    ]),
    ...(storesIntegerMoney(schema)
      ? [
          `COMMENT ON COLUMN ${schema.table}.currency_code IS 'ISO currency for the integer money columns on this audit row.';`,
        ]
      : []),
  ]
  return `CREATE TABLE IF NOT EXISTS ${schema.table} (
  change_id UUID PRIMARY KEY REFERENCES dynamic_config_change_logs (id) ON DELETE CASCADE,
  ${columns.join(',\n  ')}
);

${comments.join('\n')}`
}

export function renderAuditFieldFunction(schemas: DynamicConfigAuditSchema[]): string {
  const branches = schemas.map(schema => {
    const previous = schema.fields
      .map(field => `${quoteIdent(field.previous)} AS ${quoteIdent(field.name)}`)
      .join(',\n          ')
    const next = schema.fields
      .map(field => `${quoteIdent(field.next)} AS ${quoteIdent(field.name)}`)
      .join(',\n          ')
    return `    WHEN '${schema.namespace}' THEN CASE p_side
      WHEN 'previous' THEN (
        SELECT jsonb_strip_nulls(to_jsonb(snapshot))
        FROM (
          SELECT ${previous}
          FROM ${schema.table}
          WHERE change_id = p_change_id
        ) snapshot
      )
      WHEN 'next' THEN (
        SELECT jsonb_strip_nulls(to_jsonb(snapshot))
        FROM (
          SELECT ${next}
          FROM ${schema.table}
          WHERE change_id = p_change_id
        ) snapshot
      )
      ELSE NULL
    END`
  })
  return `CREATE OR REPLACE FUNCTION fn_dynamic_config_change_fields(
  p_change_id UUID,
  p_config_key TEXT,
  p_side TEXT
) RETURNS JSONB
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE p_config_key
${branches.join('\n')}
    ELSE NULL
  END
$fn$;

COMMENT ON FUNCTION fn_dynamic_config_change_fields(UUID, TEXT, TEXT) IS
  'Rebuilds one audited dynamic config snapshot side from its typed namespace columns.';`
}
