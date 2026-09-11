import { randomUUID } from 'node:crypto'
import { closeDynamicConfigValkeySubscriptionClient } from '@data-stores/valkey/clients'
import { dynamicConfigs, type DynamicConfig } from '@data-stores/valkey/dynamic-config'
import type { DynamicConfigField } from '@data-stores/valkey/types'

const TEST_DYNAMIC_CONFIG_PREFIX = 'dynamic-config:test-'
const TEST_DYNAMIC_CONFIG_KEY_PREFIX = 'test-'
const TEST_RATE_LIMIT_THRESHOLD = 99_999

type DynamicConfigSchema = Pick<DynamicConfig, 'key' | 'fieldTypes' | 'defaultFields'>

export type TestDynamicConfig = DynamicConfigSchema & Pick<DynamicConfig, 'fields'>

type PersistableTestDynamicConfig = DynamicConfigSchema & Pick<DynamicConfig, 'setFields'>

export function createDynamicConfigTestKey(prefix = 'config'): string {
  const workerId = process.env.VITEST_WORKER_ID ?? 'worker'

  return `${TEST_DYNAMIC_CONFIG_KEY_PREFIX}${workerId}-${prefix}-${randomUUID()}`
}

export function createDynamicConfigTestBaseline(
  config: DynamicConfigSchema,
): Record<string, DynamicConfigField> {
  const baseline = { ...config.defaultFields }

  if (config.key === 'dynamic-config:route-rate-limit-config') {
    return {
      ...baseline,
      enabled: false,
      anon_read: TEST_RATE_LIMIT_THRESHOLD,
      anon_write: TEST_RATE_LIMIT_THRESHOLD,
      anon_sensitive: TEST_RATE_LIMIT_THRESHOLD,
      anon_oauth_callback: TEST_RATE_LIMIT_THRESHOLD,
    }
  }

  if (config.key === 'dynamic-config:rate-limit-thresholds') {
    for (const name of Object.keys(config.fieldTypes)) {
      if (/_tier[0-5]$/.test(name)) baseline[name] = TEST_RATE_LIMIT_THRESHOLD
    }
    return baseline
  }

  if (config.key === 'dynamic-config:contribution-rate-limits') {
    for (const name of Object.keys(config.fieldTypes)) {
      if (name.endsWith('_limit')) baseline[name] = TEST_RATE_LIMIT_THRESHOLD
    }
    return baseline
  }

  if (config.key === 'dynamic-config:bloom-filter-config') {
    baseline['bookmarkBloomFilterEnabled'] = false
    baseline['apiKeyBloomFilterEnabled'] = false
  }

  if (config.key === 'dynamic-config:web-risk-config') baseline['enabled'] = false
  return baseline
}

export async function persistDynamicConfigTestBaseline(
  config: PersistableTestDynamicConfig,
): Promise<void> {
  await config.setFields(createDynamicConfigTestBaseline(config))
}

export function resetDynamicConfigToTestBaseline(config: TestDynamicConfig): void {
  replaceLocalFields(config, createDynamicConfigTestBaseline(config))
}

export function overrideDynamicConfigFieldsForTest(
  config: TestDynamicConfig,
  overrides: Record<string, DynamicConfigField>,
): () => void {
  const validatedOverrides = validateOverrides(config, overrides)
  const snapshot = validatedOverrides.map(([name]) => ({
    name,
    hadValue: config.fields.has(name),
    value: config.fields.get(name),
  }))
  let restored = false

  for (const [name, value] of validatedOverrides) config.fields.set(name, value)

  return function restoreDynamicConfigFields(): void {
    if (restored) return
    restored = true
    for (const { name, hadValue, value } of snapshot) {
      if (hadValue && value !== undefined) config.fields.set(name, value)
      else config.fields.delete(name)
    }
  }
}

export function snapshotDynamicConfigFieldsForTest(
  configs: readonly TestDynamicConfig[],
): () => void {
  const snapshots = configs.map(config => ({ config, fields: new Map(config.fields) }))
  let restored = false

  return function restoreDynamicConfigSnapshots(): void {
    if (restored) return
    restored = true
    for (const { config, fields } of snapshots.toReversed()) {
      config.fields.clear()
      for (const [name, value] of fields) config.fields.set(name, value)
    }
  }
}

export function deleteDynamicConfigFieldsForTest(
  config: TestDynamicConfig,
  names: readonly string[],
): () => void {
  for (const name of names) {
    if (!config.fieldTypes[name]) throw new Error(`Unknown DynamicConfig test field: ${name}`)
  }
  const restore = snapshotDynamicConfigFieldsForTest([config])
  for (const name of names) config.fields.delete(name)
  return restore
}

export function overrideUncheckedDynamicConfigFieldsForTest(
  config: TestDynamicConfig,
  overrides: Record<string, unknown>,
): () => void {
  for (const name of Object.keys(overrides)) {
    if (!config.fieldTypes[name]) throw new Error(`Unknown DynamicConfig test field: ${name}`)
  }
  const restore = snapshotDynamicConfigFieldsForTest([config])
  for (const [name, value] of Object.entries(overrides)) {
    config.fields.set(name, value as DynamicConfigField)
  }
  return restore
}

export async function closeTestDynamicConfigs(): Promise<void> {
  const testConfigs = [...dynamicConfigs].filter(config =>
    config.key.startsWith(TEST_DYNAMIC_CONFIG_PREFIX),
  )
  await Promise.all(testConfigs.map(config => config.close()))
}

export async function closeTestDynamicConfigContext(): Promise<void> {
  await closeTestDynamicConfigs()
  await closeDynamicConfigValkeySubscriptionClient()
}

export async function closeScopedDynamicConfigContext(
  configs: Array<{ close(): Promise<void> }>,
): Promise<void> {
  await Promise.all(configs.map(config => config.close()))
  await closeDynamicConfigValkeySubscriptionClient()
}

function validateOverrides(
  config: TestDynamicConfig,
  overrides: Record<string, DynamicConfigField>,
): Array<[string, DynamicConfigField]> {
  const validated: Array<[string, DynamicConfigField]> = []

  for (const [name, value] of Object.entries(overrides)) {
    const expectedType = config.fieldTypes[name]
    if (!expectedType) throw new Error(`Unknown DynamicConfig test field: ${name}`)
    if (typeof value !== expectedType) {
      throw new TypeError(
        `DynamicConfig test field ${name} must be ${expectedType}, received ${typeof value}`,
      )
    }
    if (expectedType === 'number' && !Number.isFinite(value)) {
      throw new TypeError(`DynamicConfig test field ${name} must be a finite number`)
    }
    validated.push([name, value])
  }

  return validated
}

function replaceLocalFields(
  config: TestDynamicConfig,
  fields: Record<string, DynamicConfigField>,
): void {
  config.fields.clear()
  for (const [name, value] of Object.entries(fields)) config.fields.set(name, value)
}
