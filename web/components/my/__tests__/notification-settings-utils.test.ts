import { describe, expect, it } from 'vitest'
import { getTimeZoneOptions } from '../notification-settings-utils'

describe('getTimeZoneOptions', () => {
  it('keeps nonempty server timezones that the browser does not recognize', () => {
    expect(getTimeZoneOptions('Etc/Backend_Only')).toContain('Etc/Backend_Only')
  })

  it('does not add an empty timezone option', () => {
    expect(getTimeZoneOptions('')).not.toContain('')
  })
})
