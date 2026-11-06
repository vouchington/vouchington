import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  resetDynamicConfigToTestBaseline,
  snapshotDynamicConfigFieldsForTest,
  type TestDynamicConfig,
} from './dynamic-config.mts'

type ClosableTestDynamicConfig = TestDynamicConfig & { close: () => Promise<void> }

const quotaConfigs = [bedrockEmbeddingsBatchConfig]

let initialization: Promise<void> | undefined

/** The quota owner restores this snapshot only after its real workers have drained. */
export async function initializeEmbeddingCreationConfig(): Promise<() => void> {
  initialization ??= initialize()
  await initialization
  return snapshotDynamicConfigFieldsForTest(quotaConfigs)
}

async function initialize(): Promise<void> {
  const initialized = await Promise.allSettled(
    quotaConfigs.map(config => config.waitForInitialization()),
  )
  const closed = await Promise.allSettled(
    quotaConfigs.map(config => (config as unknown as ClosableTestDynamicConfig).close()),
  )
  const errors = [...initialized, ...closed].flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (errors.length)
    throw new AggregateError(errors, 'Embedding configuration initialization failed')
  for (const config of quotaConfigs) resetDynamicConfigToTestBaseline(config)
}
