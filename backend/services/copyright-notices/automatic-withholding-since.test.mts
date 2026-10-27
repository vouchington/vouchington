import { describe, expect, it } from 'vitest'
import {
  overrideAutomaticWithholdingSinceForTest,
  useAutomaticWithholdingSwitch,
} from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import {
  getAutomaticEnforcementSince,
  getAutomaticWithholdingWindow,
} from './automatic-withholding-since.mts'

describe('the current automatic withholding on-period', () => {
  const switchOn = useAutomaticWithholdingSwitch()

  it('fails closed when the current switch-on field is absent or malformed', async () => {
    await switchOn()
    for (const value of ['', 'not-a-date', '2024-06-01']) {
      const restore = await overrideAutomaticWithholdingSinceForTest(value)
      try {
        await expect(getAutomaticWithholdingWindow()).resolves.toEqual({
          enabled: true,
          since: null,
        })
        await expect(getAutomaticEnforcementSince()).resolves.toBeNull()
      } finally {
        restore()
      }
    }
  })

  it.each([
    '2024-01-31T23:59:59.999Z',
    '2024-02-01T00:00:00.001Z',
    '2024-02-29T23:59:59.999Z',
    '2024-03-01T00:00:00.001Z',
    '2024-12-31T23:59:59.999Z',
    '2025-01-01T00:00:00.001Z',
  ])('preserves the exact current switch-on instant at %s', async instant => {
    await switchOn()
    const at = new Date(instant)
    const restore = await overrideAutomaticWithholdingSinceForTest(at)
    try {
      await expect(getAutomaticWithholdingWindow()).resolves.toEqual({ enabled: true, since: at })
    } finally {
      restore()
    }
  })

  it('has no withholding window while the switch is off', async () => {
    await expect(getAutomaticWithholdingWindow()).resolves.toEqual({ enabled: false, since: null })
    await expect(getAutomaticEnforcementSince()).resolves.toBeNull()
  })

  it('opens enforcement only with all approved thresholds', async () => {
    await switchOn()
    const window = await getAutomaticWithholdingWindow()
    expect(window.since).toBeInstanceOf(Date)
    await expect(getAutomaticEnforcementSince()).resolves.toEqual(window.since)
  })

  it('stays closed while a threshold is unset', async () => {
    await switchOn({ automaticWithholdingClaimantDailyCap: -1 })
    await expect(getAutomaticEnforcementSince()).resolves.toBeNull()
  })
})
