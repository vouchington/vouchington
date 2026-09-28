/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the top-level await initializes/resets every registered dynamic config once per run, and the beforeEach/afterEach snapshot-restore hooks must apply to all tests in the project, so they cannot be wrapped in a describe block. */
import { dynamicConfigRegistry } from '@services/dynamic-config-admin'
import { afterEach, beforeEach } from 'vitest'
import {
  resetDynamicConfigToTestBaseline,
  snapshotDynamicConfigFieldsForTest,
} from '../backend/test-helpers/dynamic-config.mts'

await Promise.all(
  dynamicConfigRegistry.map(async entry => {
    const { config } = entry
    await config.waitForInitialization()
    await config.close()
    resetDynamicConfigToTestBaseline(config)
  }),
)

const isolatedConfigs = dynamicConfigRegistry.map(entry => entry.config)
let restoreTestSnapshot: (() => void) | undefined

beforeEach(() => {
  restoreTestSnapshot = snapshotDynamicConfigFieldsForTest(isolatedConfigs)
})

afterEach(() => {
  restoreTestSnapshot?.()
  restoreTestSnapshot = undefined
})
