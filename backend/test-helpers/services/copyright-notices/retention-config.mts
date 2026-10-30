import { afterEach } from 'vitest'
import { copyrightConfig } from '../../../services/copyright-notices/config.mts'
import { overrideDynamicConfigFieldsForTest } from '../../dynamic-config.mts'

type RetentionConfigFields = {
  evidenceRetentionDeletion: boolean
  caseRetentionMonths: number
  retentionCaseBatchSize?: number
  retentionProofPageSize?: number
  retentionProofMaxPages?: number
}

/**
 * Returns a setter for the retention switch and calendar-month period in this fork's copy of the
 * `copyright` config, restored after each test. The config is detached from Valkey pub/sub first,
 * so a namespace update from another fork cannot flip a retention setting mid-test.
 */
export function useCopyrightRetentionConfig(): (fields: RetentionConfigFields) => Promise<void> {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })
  return async fields => {
    restore?.()
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, fields)
  }
}
