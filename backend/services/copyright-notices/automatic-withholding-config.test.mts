import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightConfig, getAutomaticWithholdingThresholds } from './config.mts'

const set = {
  automaticWithholdingMinTrustTier: 2,
  automaticWithholdingMinAccountAgeDays: 7,
  automaticWithholdingClaimantDailyCap: 5,
  automaticWithholdingPosterDailyCap: 3,
}

describe('automatic withholding thresholds', () => {
  let restore: (() => void) | undefined

  beforeAll(async () => {
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
  })

  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('ships unset, so automatic withholding is refused until an operator approves every gate', async () => {
    expect(await getAutomaticWithholdingThresholds()).toBeNull()
  })

  it('returns the approved gates once every one is set', async () => {
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, set)

    expect(await getAutomaticWithholdingThresholds()).toEqual({
      minTrustTier: 2,
      minAccountAgeDays: 7,
      claimantDailyCap: 5,
      posterDailyCap: 3,
    })
  })

  it('treats zero as a real value, not as unset', async () => {
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      ...set,
      automaticWithholdingMinTrustTier: 0,
      automaticWithholdingMinAccountAgeDays: 0,
      automaticWithholdingPosterDailyCap: 0,
    })

    expect(await getAutomaticWithholdingThresholds()).toMatchObject({
      minTrustTier: 0,
      minAccountAgeDays: 0,
      posterDailyCap: 0,
    })
  })

  it.each(Object.keys(set))('refuses when only %s is unset', async name => {
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, { ...set, [name]: -1 })

    expect(await getAutomaticWithholdingThresholds()).toBeNull()
  })

  it('refuses a fractional value instead of rounding it', async () => {
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      ...set,
      automaticWithholdingClaimantDailyCap: 2.5,
    })

    expect(await getAutomaticWithholdingThresholds()).toBeNull()
  })
})
