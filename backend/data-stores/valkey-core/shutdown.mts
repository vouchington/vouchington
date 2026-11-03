import './app-integration.mts'

import { registerGracefulShutdownValkey } from '@data-stores/graceful-shutdown'
import { closeValkeyClients } from 'valkyries'
import { dynamicConfigs } from 'valkyries/dynamic-config'
import { closeSharedCommandClientFromRegistry, getGlideMQInstances } from './glide-mq-registry.mts'

let shutdown = false

async function gracefulShutdown(): Promise<void> {
  if (shutdown) return
  shutdown = true

  // closeValkeyClients closes every live DynamicConfig before the clients it owns.
  const results = await Promise.allSettled([
    ...getGlideMQInstances().map(instance => Promise.resolve().then(() => instance.close())),
    Promise.resolve().then(() => closeValkeyClients({ throwOnError: true })),
  ])
  const errors = collectErrors(results)

  const sharedCommandClientResult = await Promise.allSettled([
    Promise.resolve().then(closeSharedCommandClientFromRegistry),
  ])
  errors.push(...collectErrors(sharedCommandClientResult))

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Valkey shutdown failed')
  }
}

export const onGracefulShutdown = Object.assign(gracefulShutdown, {
  async waitForInitialization(): Promise<void> {
    const results = await Promise.allSettled(
      dynamicConfigs.map(config => Promise.resolve().then(() => config.waitForInitialization())),
    )
    const errors = collectErrors(results)
    if (errors.length > 0) throw new AggregateError(errors, 'Dynamic config initialization failed')
  },
})

// Self-register so the final shutdown phase (after drain callbacks) closes these clients, without
// @data-stores/graceful-shutdown importing @data-stores/valkey directly (that direct import
// previously created a workspace dependency cycle).
registerGracefulShutdownValkey(onGracefulShutdown)

function collectErrors(results: PromiseSettledResult<unknown>[]): Error[] {
  return results.flatMap(result => (result.status === 'rejected' ? [toError(result.reason)] : []))
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
