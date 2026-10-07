import { close as closePsql } from '@data-stores/psql'
import { onGracefulShutdown, waitForDynamicConfigInitialization } from '@data-stores/valkey-core'
import { runCatalogGeneration } from './generate-catalog.mts'

const { ALL_TOOLS } = await import('@voucha/tools/registry/index')

await runCatalogGeneration(process.argv.slice(2), {
  tools: ALL_TOOLS,
  ready: waitForDynamicConfigInitialization(),
  closeResources: [onGracefulShutdown, closePsql],
})
