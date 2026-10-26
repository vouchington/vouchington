import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  overrideUncheckedDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { botChallengeConfig, getBotChallengeClearanceSeconds } from './bot-challenge-config.mts'

describe('bot challenge clearance config', () => {
  afterEach(() => deleteDynamicConfigFieldsForTest(botChallengeConfig, ['clearance_seconds']))

  it('defaults to five minutes', () => {
    expect(getBotChallengeClearanceSeconds()).toBe(300)
  })

  it('honors zero and the upper bound', () => {
    overrideDynamicConfigFieldsForTest(botChallengeConfig, { clearance_seconds: 0 })
    expect(getBotChallengeClearanceSeconds()).toBe(0)
    overrideDynamicConfigFieldsForTest(botChallengeConfig, { clearance_seconds: 3600 })
    expect(getBotChallengeClearanceSeconds()).toBe(3600)
  })

  it.each([-1, 3601, 1.5, '300'])('requires a challenge for invalid stored value %s', value => {
    overrideUncheckedDynamicConfigFieldsForTest(botChallengeConfig, { clearance_seconds: value })
    expect(getBotChallengeClearanceSeconds()).toBe(0)
  })
})
