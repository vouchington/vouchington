import { registerGracefulShutdownPSQL } from '@data-stores/graceful-shutdown'
import { close } from './setup.mts'

let shutdown = false
export const onGracefulShutdown = async () => {
  if (shutdown) return
  shutdown = true
  await close()
}

// Self-register so the final shutdown phase (after drain callbacks) closes these pools, without
// @data-stores/graceful-shutdown importing @data-stores/psql directly (that direct import
// previously created a workspace dependency cycle).
registerGracefulShutdownPSQL(onGracefulShutdown)
