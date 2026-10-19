import { dynamicConfigRegistry } from '../services/dynamic-config-admin/registry.mts'
import {
  resetDynamicConfigToTestBaseline,
  snapshotDynamicConfigFieldsForTest,
  type TestDynamicConfig,
} from './dynamic-config.mts'

type ClosableTestDynamicConfig = TestDynamicConfig & { close: () => Promise<void> }

let initialization: Promise<void> | undefined

/** The quota owner restores this snapshot only after its real workers have drained. */
export async function initializeEmbeddingCreationConfig(): Promise<() => void> {
  initialization ??= initialize()
  await initialization
  return snapshotDynamicConfigFieldsForTest(
    dynamicConfigRegistry.entries.map(entry => entry.config as unknown as TestDynamicConfig),
  )
}

async function initialize(): Promise<void> {
  const initialized = await Promise.allSettled(
    dynamicConfigRegistry.entries.map(({ config }) => config.waitForInitialization()),
  )
  const closed = await Promise.allSettled(
    dynamicConfigRegistry.entries.map(({ config }) =>
      (config as unknown as ClosableTestDynamicConfig).close(),
    ),
  )
  const errors = [...initialized, ...closed].flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (errors.length)
    throw new AggregateError(errors, 'Embedding configuration initialization failed')
  for (const { config } of dynamicConfigRegistry.entries)
    resetDynamicConfigToTestBaseline(config as unknown as TestDynamicConfig)
}
