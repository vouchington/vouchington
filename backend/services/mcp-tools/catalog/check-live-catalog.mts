import { close as closePsql } from '@data-stores/psql'
import { onGracefulShutdown, waitForDynamicConfigInitialization } from '@data-stores/valkey-core'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import { listMcpToolsForUser } from '../list-tools.mts'
import { findCatalogContractViolations } from './check-catalog-contracts.mts'

try {
  await waitForDynamicConfigInitialization()
  const errors = findCatalogContractViolations(ALL_TOOLS, listMcpToolsForUser, 17)
  if (errors.length > 0) throw new Error(`MCP catalog contract violations:\n${errors.join('\n')}`)
} finally {
  await Promise.all([onGracefulShutdown(), closePsql()])
}
