import './app-integration.mts'

import { registerGracefulShutdownValkey } from '@data-stores/graceful-shutdown'
import { closeValkeyClients } from 'valkyries'
import { dynamicConfigs } from 'valkyries/dynamic-config'
import { closeSharedCommandClientFromRegistry, getGlideMQInstances } from './glide-mq-registry.mts'

type ShutdownDeps = {
  getGlideMQInstances: () => Array<{ close(): Promise<void> }>
  closeValkeyClients: typeof closeValkeyClients
  closeSharedCommandClientFromRegistry: typeof closeSharedCommandClientFromRegistry
}

const defaultShutdownDeps: ShutdownDeps = {
  getGlideMQInstances,
  closeValkeyClients,
  closeSharedCommandClientFromRegistry,
}

export function createGracefulShutdown(
  deps: ShutdownDeps = defaultShutdownDeps,
): () => Promise<void> {
  let shutdown = false

  return async function onGracefulShutdown(): Promise<void> {
    if (shutdown) return
    shutdown = true

    // closeValkeyClients closes every live DynamicConfig before the clients it owns.
    const results = await Promise.allSettled([
      ...deps.getGlideMQInstances().map(instance => Promise.resolve().then(() => instance.close())),
      Promise.resolve().then(() => deps.closeValkeyClients({ throwOnError: true })),
    ])
    const errors = collectErrors(results)

    const sharedCommandClientResult = await Promise.allSettled([
      Promise.resolve().then(deps.closeSharedCommandClientFromRegistry),
    ])
    errors.push(...collectErrors(sharedCommandClientResult))

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Valkey shutdown failed')
    }
  }
}

export const onGracefulShutdown = Object.assign(createGracefulShutdown(), {
  async waitForInitialization(
    configs: Iterable<{ waitForInitialization(): Promise<void> }> = dynamicConfigs,
  ): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(configs, config => Promise.resolve().then(() => config.waitForInitialization())),
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
