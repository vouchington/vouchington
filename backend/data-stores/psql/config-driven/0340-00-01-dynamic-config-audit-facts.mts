import {
  dynamicConfigAuditSchemas,
  renderAuditFieldFunction,
  renderAuditTable,
} from '../dynamic-config-audit-schema.mts'

/** @internal */
export default function dynamicConfigAuditFactsSql(): string {
  const schemas = dynamicConfigAuditSchemas()
  const keys = schemas.map(schema => `'${schema.namespace}'`).join(', ')
  const tables = schemas.map(renderAuditTable).join('\n\n')
  return `${tables}

ALTER TABLE dynamic_config_change_logs
  DROP CONSTRAINT IF EXISTS dynamic_config_change_logs_config_key_check;

ALTER TABLE dynamic_config_change_logs
  ADD CONSTRAINT dynamic_config_change_logs_config_key_check
  CHECK (config_key IN (${keys}))
  NOT VALID;

ALTER TABLE dynamic_config_change_logs
  VALIDATE CONSTRAINT dynamic_config_change_logs_config_key_check;

${renderAuditFieldFunction(schemas)}`
}
