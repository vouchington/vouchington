import { describe, expect, it } from 'vitest'
import {
  assertStagingAuroraWakeAllowed,
  parseStagingAuroraWakeSeconds,
} from './staging-aurora-wake-guard.mts'

describe('assertStagingAuroraWakeAllowed', () => {
  it('allows staging', () => {
    expect(() => assertStagingAuroraWakeAllowed({ ENVIRONMENT: 'staging' })).not.toThrow()
  })

  it.each([{ ENVIRONMENT: 'production' }, {}])('rejects %j', env => {
    expect(() => assertStagingAuroraWakeAllowed(env)).toThrow('staging aurora wake guard')
  })
})

describe('parseStagingAuroraWakeSeconds', () => {
  it.each([
    ['1', 1],
    ['900', 900],
    ['3600', 3600],
  ])('accepts %s', (value, seconds) => {
    expect(parseStagingAuroraWakeSeconds([value])).toBe(seconds)
  })

  it.each([[[]], [['0']], [['-5']], [['1.5']], [['abc']], [['']], [['01']], [['1', '2']]])(
    'rejects %j',
    args => {
      expect(() => parseStagingAuroraWakeSeconds(args)).toThrow('needs one <seconds> argument')
    },
  )

  it.each(['3601', '99999999'])('rejects %s above the upper bound', value => {
    expect(() => parseStagingAuroraWakeSeconds([value])).toThrow('is at most 3600')
  })
})
