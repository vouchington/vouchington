import { describe, expect, it } from 'vitest'
import { useAutomaticWithholdingSwitch } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { recordTestConfigChange } from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import {
  findSwitchOnTime,
  getAutomaticEnforcementSince,
  getAutomaticWithholdingWindow,
} from './automatic-withholding-since.mts'

const firstSwitchOn = new Date('2024-06-01T12:00:00.000Z')
const editWhileOn = new Date('2024-06-06T12:00:00.000Z')
const switchOff = new Date('2024-06-08T12:00:00.000Z')
const latestSwitchOn = new Date('2024-06-10T12:00:00.000Z')

const off = { automaticProvisionalWithholding: false }
const on = { automaticProvisionalWithholding: true }

describe('findSwitchOnTime', () => {
  it('is null when the switch was never audited on', async () => {
    const key = `since-never-${crypto.randomUUID()}`
    await recordTestConfigChange(key, firstSwitchOn, off, off)
    await expect(findSwitchOnTime(key)).resolves.toBeNull()
  })

  it('reads the latest off-to-on change and ignores edits made while on', async () => {
    const key = `since-edited-${crypto.randomUUID()}`
    await recordTestConfigChange(key, firstSwitchOn, off, on)
    await recordTestConfigChange(key, editWhileOn, on, { ...on, reviewTargetMinutes: 30 })
    await expect(findSwitchOnTime(key)).resolves.toEqual(firstSwitchOn)
  })

  it('restarts the on-period at each flip back on', async () => {
    const key = `since-reflipped-${crypto.randomUUID()}`
    await recordTestConfigChange(key, firstSwitchOn, off, on)
    await recordTestConfigChange(key, switchOff, on, off)
    await recordTestConfigChange(key, latestSwitchOn, off, on)
    await expect(findSwitchOnTime(key)).resolves.toEqual(latestSwitchOn)
  })

  it('treats a change from a snapshot without the field as a switch-on', async () => {
    const key = `since-bare-${crypto.randomUUID()}`
    await recordTestConfigChange(key, editWhileOn, {}, on)
    await expect(findSwitchOnTime(key)).resolves.toEqual(editWhileOn)
  })

  it.each([
    '2024-01-31T23:59:59.999Z',
    '2024-02-01T00:00:00.001Z',
    '2024-02-29T23:59:59.999Z',
    '2024-03-01T00:00:00.001Z',
    '2024-12-31T23:59:59.999Z',
    '2025-01-01T00:00:00.001Z',
  ])('preserves an exact private audited switch-on instant at %s', async instant => {
    const key = `since-exact-${crypto.randomUUID()}`
    const at = new Date(instant)
    await recordTestConfigChange(key, at, off, on)
    await expect(findSwitchOnTime(key)).resolves.toEqual(at)
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
