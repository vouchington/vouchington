import { close as closePsql } from '../backend/data-stores/psql/index.mts'
import { onGracefulShutdown } from '../backend/data-stores/valkey-core/index.mts'
import { ALL_TOOLS } from '../backend/tools/registry/index.mts'
import { listMcpToolsForUser } from '../backend/services/mcp-tools/list-tools.mts'
import { findCatalogContractViolations } from '../backend/services/mcp-tools/catalog/check-catalog-contracts.mts'

try {
  await onGracefulShutdown.waitForInitialization()
  const errors = findCatalogContractViolations(ALL_TOOLS, listMcpToolsForUser, 17)
  if (errors.length > 0) throw new Error(`MCP catalog contract violations:\n${errors.join('\n')}`)
} finally {
  await Promise.all([onGracefulShutdown(), closePsql()])
}
