import { close as closePsql } from '@data-stores/psql'
import { onGracefulShutdown } from '@data-stores/valkey-core'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { runCatalogGeneration } from './generate-catalog.mts'

await runCatalogGeneration(process.argv.slice(2), {
  tools: ALL_TOOLS,
  ready: onGracefulShutdown.waitForInitialization(),
  closeResources: [onGracefulShutdown, closePsql],
})
