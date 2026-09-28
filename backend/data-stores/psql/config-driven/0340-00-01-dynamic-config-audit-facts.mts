import { dynamicConfigAuditDdl } from '../dynamic-config-audit-schema.mts'

export default function createDynamicConfigAuditFactsSql(): string {
  return dynamicConfigAuditDdl()
}
