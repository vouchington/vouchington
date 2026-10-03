import { close as closePsql } from '@data-stores/psql'
import { onGracefulShutdown } from '@data-stores/valkey-core'
import { runCatalogGeneration } from './generate-catalog.mts'

await runCatalogGeneration(process.argv.slice(2), {
  closeResources: [onGracefulShutdown, closePsql],
})
