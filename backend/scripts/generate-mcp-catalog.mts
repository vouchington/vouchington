import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { onGracefulShutdown } from '@data-stores/valkey-core'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { runCatalogGeneration } from './mcp-catalog-generation.mts'

await runCatalogGeneration(process.argv.slice(2), {
  tools: ALL_TOOLS,
  ready: onGracefulShutdown.waitForInitialization(),
  closeResources: [shutdownDataStoresForOneOffCommand],
})
