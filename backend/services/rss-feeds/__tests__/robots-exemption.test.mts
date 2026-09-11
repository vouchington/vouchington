import { describe, expect, it } from 'vitest'
import { resolveIgnoreRobotsTxt } from '../robots-exemption.mts'

describe('resolveIgnoreRobotsTxt', () => {
  it('feed=true overrides hostname=false and globalDefault=false', () => {
    expect(resolveIgnoreRobotsTxt(true, false, false)).toBe(true)
  })

  it('feed=false overrides hostname=true and globalDefault=true', () => {
    expect(resolveIgnoreRobotsTxt(false, true, true)).toBe(false)
  })

  it('hostname=true wins when feed is null', () => {
    expect(resolveIgnoreRobotsTxt(null, true, false)).toBe(true)
  })

  it('hostname=false overrides globalDefault=true when feed is null', () => {
    expect(resolveIgnoreRobotsTxt(null, false, true)).toBe(false)
  })

  it('globalDefault=true wins when both feed and hostname are null', () => {
    expect(resolveIgnoreRobotsTxt(null, null, true)).toBe(true)
  })

  it('globalDefault=false wins when both feed and hostname are null', () => {
    expect(resolveIgnoreRobotsTxt(null, null, false)).toBe(false)
  })

  it('undefined feed is treated as null (inherit from hostname)', () => {
    expect(resolveIgnoreRobotsTxt(undefined, null, true)).toBe(true)
  })

  it('undefined feed and hostname fall back to globalDefault=false', () => {
    expect(resolveIgnoreRobotsTxt(undefined, undefined, false)).toBe(false)
  })
})
