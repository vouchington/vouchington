import { describe, expect, it } from 'vitest'
import { useAutomaticWithholdingSwitch } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { recordTestConfigChange } from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import {
  findSwitchOnTime,
  getAutomaticEnforcementSince,
  getAutomaticWithholdingWindow,
} from './automatic-withholding-since.mts'

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days between an instant and now, so a test can name how long ago it expects a flip. */
function wholeDaysAgo(time: Date | null): number | null {
  return time ? Math.round((Date.now() - time.getTime()) / DAY_MS) : null
}

const off = { automaticProvisionalWithholding: false }
const on = { automaticProvisionalWithholding: true }

describe('findSwitchOnTime', () => {
  it('is null when the switch was never audited on', async () => {
    const key = `since-never-${crypto.randomUUID()}`
    await recordTestConfigChange(key, 3, off, off)
    await expect(findSwitchOnTime(key)).resolves.toBeNull()
  })

  it('reads the latest off-to-on change and ignores edits made while on', async () => {
    const key = `since-edited-${crypto.randomUUID()}`
    await recordTestConfigChange(key, 10, off, on)
    await recordTestConfigChange(key, 5, on, { ...on, reviewTargetMinutes: 30 })
    expect(wholeDaysAgo(await findSwitchOnTime(key))).toBe(10)
  })

  it('restarts the on-period at each flip back on', async () => {
    const key = `since-reflipped-${crypto.randomUUID()}`
    await recordTestConfigChange(key, 10, off, on)
    await recordTestConfigChange(key, 5, on, off)
    await recordTestConfigChange(key, 1, off, on)
    expect(wholeDaysAgo(await findSwitchOnTime(key))).toBe(1)
  })

  it('treats a change from a snapshot without the field as a switch-on', async () => {
    const key = `since-bare-${crypto.randomUUID()}`
    await recordTestConfigChange(key, 2, {}, on)
    expect(wholeDaysAgo(await findSwitchOnTime(key))).toBe(2)
  })
})

describe('the live switch decides whether automation is on', () => {
  const switchOn = useAutomaticWithholdingSwitch()

  it('has no window while the switch is off', async () => {
    await expect(getAutomaticWithholdingWindow()).resolves.toEqual({ enabled: false, since: null })
    await expect(getAutomaticEnforcementSince()).resolves.toBeNull()
  })

  it('opens the window at the audited switch-on once the switch is on', async () => {
    await switchOn()
    const window = await getAutomaticWithholdingWindow()
    expect(window.enabled).toBe(true)
    expect(window.since).toBeInstanceOf(Date)
    expect((window.since as Date).getTime()).toBeLessThan(Date.now())
    await expect(getAutomaticEnforcementSince()).resolves.toEqual(window.since)
  })

  it('stays closed while any approved threshold is unset', async () => {
    await switchOn({ automaticWithholdingClaimantDailyCap: -1 })
    await expect(getAutomaticEnforcementSince()).resolves.toBeNull()
  })
})
