/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the top-level await initializes/resets every registered dynamic config once per run, and the beforeEach/afterEach snapshot-restore hooks must apply to all tests in the project, so they cannot be wrapped in a describe block. */
import { dynamicConfigRegistry } from '@services/dynamic-config-admin/registry'
import { afterEach, beforeEach } from 'vitest'
import {
  resetDynamicConfigToTestBaseline,
  snapshotDynamicConfigFieldsForTest,
  type TestDynamicConfig,
} from '../backend/test-helpers/dynamic-config.mts'

type IsolatedTestDynamicConfig = TestDynamicConfig & {
  waitForInitialization: () => Promise<void>
  close: () => Promise<void>
}
type RegisteredDynamicConfig = (typeof dynamicConfigRegistry.entries)[number]['config']

function assertIsolatedTestDynamicConfig(
  config: RegisteredDynamicConfig,
): asserts config is RegisteredDynamicConfig & IsolatedTestDynamicConfig {
  if (
    typeof config !== 'object' ||
    config === null ||
    !('fields' in config) ||
    !(config.fields instanceof Map) ||
    !('waitForInitialization' in config) ||
    typeof config.waitForInitialization !== 'function' ||
    !('close' in config) ||
    typeof config.close !== 'function'
  ) {
    throw new TypeError('Registered dynamic configs must expose isolated test runtime state')
  }
}

const isolatedConfigs = dynamicConfigRegistry.entries.map(entry => {
  assertIsolatedTestDynamicConfig(entry.config)
  return entry.config
})

await Promise.all(
  isolatedConfigs.map(async config => {
    await config.waitForInitialization()
    await config.close()
    resetDynamicConfigToTestBaseline(config)
  }),
)

let restoreTestSnapshot: (() => void) | undefined

beforeEach(() => {
  restoreTestSnapshot = snapshotDynamicConfigFieldsForTest(isolatedConfigs)
})

afterEach(() => {
  restoreTestSnapshot?.()
  restoreTestSnapshot = undefined
})
