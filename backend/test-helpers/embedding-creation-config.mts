import { dynamicConfigRegistry } from '../services/dynamic-config-admin/registry.mts'
import {
  resetDynamicConfigToTestBaseline,
  snapshotDynamicConfigFieldsForTest,
} from './dynamic-config.mts'

let initialization: Promise<void> | undefined

/** The quota owner restores this snapshot only after its real workers have drained. */
export async function initializeEmbeddingCreationConfig(): Promise<() => void> {
  initialization ??= initialize()
  await initialization
  return snapshotDynamicConfigFieldsForTest(dynamicConfigRegistry.map(entry => entry.config))
}

async function initialize(): Promise<void> {
  const initialized = await Promise.allSettled(
    dynamicConfigRegistry.map(({ config }) => config.waitForInitialization()),
  )
  const closed = await Promise.allSettled(dynamicConfigRegistry.map(({ config }) => config.close()))
  const errors = [...initialized, ...closed].flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (errors.length)
    throw new AggregateError(errors, 'Embedding configuration initialization failed')
  for (const { config } of dynamicConfigRegistry) resetDynamicConfigToTestBaseline(config)
}
