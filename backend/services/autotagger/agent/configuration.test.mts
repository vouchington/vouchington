import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it } from 'vitest'
import { autotaggerPaidLimitsConfig } from '../limits-config.mts'
import { resolveAutotaggerAgentRunConfiguration } from './configuration.mts'

describe('resolveAutotaggerAgentRunConfiguration (real PG)', () => {
  it('names the classifier row and actor, and no prompt, model or threshold', async () => {
    const resolved = await resolveAutotaggerAgentRunConfiguration()

    expect(resolved).toMatchObject({
      remote: null,
      agent: { candidateKind: 'topic' },
      configuration: { revision: 1, actorId: resolved?.actorId },
    })
    expect(Object.keys(resolved!.configuration).toSorted()).toEqual([
      'actorId',
      'classifierId',
      'revision',
    ])
    expect(JSON.parse(resolved!.configurationJson)).toEqual(resolved!.configuration)
  })

  it('is no work while the operator kill switch is off', async () => {
    await autotaggerPaidLimitsConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      enabled: false,
    })
    try {
      await expect(resolveAutotaggerAgentRunConfiguration()).resolves.toBeNull()
    } finally {
      restore()
    }
  })
})
