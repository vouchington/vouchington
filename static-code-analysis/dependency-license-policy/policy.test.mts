import { describe, expect, it } from 'vitest'

import { evaluatePackageLicenseExpression } from './policy.mts'

describe('evaluatePackageLicenseExpression', () => {
  it('allows common permissive licenses', () => {
    expect(evaluatePackageLicenseExpression('MIT', 'left-pad').ok).toBe(true)
    expect(evaluatePackageLicenseExpression('Apache-2.0', 'some-lib').ok).toBe(true)
    expect(evaluatePackageLicenseExpression('ISC', 'some-lib').ok).toBe(true)
    expect(evaluatePackageLicenseExpression('BSD-3-Clause', 'some-lib').ok).toBe(true)
  })

  it('allows an OR expression when at least one branch is clean', () => {
    expect(evaluatePackageLicenseExpression('(MIT OR Apache-2.0)', 'some-lib').ok).toBe(true)
    expect(evaluatePackageLicenseExpression('(GPL-3.0-only OR MIT)', 'some-lib').ok).toBe(true)
  })

  it('denies a bare GPL family license', () => {
    const result = evaluatePackageLicenseExpression('GPL-3.0-only', 'copyleft-lib')
    expect(result.ok).toBe(false)
    expect(result.deniedAtoms).toEqual(['GPL-3.0-only'])
  })

  it('denies AGPL, which does not start with "GPL" and needs its own deny entry', () => {
    expect(evaluatePackageLicenseExpression('AGPL-3.0-only', 'network-lib').ok).toBe(false)
  })

  it('denies EPL, CDDL, SSPL, and BUSL', () => {
    expect(evaluatePackageLicenseExpression('EPL-2.0', 'x').ok).toBe(false)
    expect(evaluatePackageLicenseExpression('CDDL-1.0', 'x').ok).toBe(false)
    expect(evaluatePackageLicenseExpression('SSPL-1.0', 'x').ok).toBe(false)
    expect(evaluatePackageLicenseExpression('BUSL-1.1', 'x').ok).toBe(false)
  })

  it('denies a "this version or later" GPL expression', () => {
    expect(evaluatePackageLicenseExpression('GPL-2.0+', 'x').ok).toBe(false)
  })

  it('denies an AND expression when any branch is denied, even if another branch is clean', () => {
    const result = evaluatePackageLicenseExpression('MIT AND GPL-3.0-only', 'mixed-lib')
    expect(result.ok).toBe(false)
    expect(result.deniedAtoms).toEqual(['GPL-3.0-only'])
  })

  it('denies a package with no usable license grant ("Unknown" or "UNLICENSED")', () => {
    expect(evaluatePackageLicenseExpression('Unknown', 'mystery-lib').ok).toBe(false)
    expect(evaluatePackageLicenseExpression('UNLICENSED', 'mystery-lib').ok).toBe(false)
    expect(evaluatePackageLicenseExpression('', 'mystery-lib').ok).toBe(false)
  })

  it('normalizes the known non-SPDX "SIL OPEN FONT LICENSE" string to OFL-1.1 and allows it', () => {
    // geist@1.7.2 ships this literal free-text string instead of the SPDX
    // id (compare @fontsource/inter, which reports OFL-1.1 directly).
    const result = evaluatePackageLicenseExpression('SIL OPEN FONT LICENSE', 'geist')
    expect(result.ok).toBe(true)
    expect(result.deniedAtoms).toEqual([])
  })

  it('allows MPL-2.0 for any package (unconditional allowlist entry)', () => {
    expect(evaluatePackageLicenseExpression('MPL-2.0', '@ghostery/adblocker').ok).toBe(true)
    expect(evaluatePackageLicenseExpression('MPL-2.0', 'some-other-package').ok).toBe(true)
  })

  it('allows LGPL-3.0-or-later only for @img/sharp-libvips-* packages', () => {
    expect(
      evaluatePackageLicenseExpression('LGPL-3.0-or-later', '@img/sharp-libvips-darwin-arm64').ok,
    ).toBe(true)
    expect(
      evaluatePackageLicenseExpression('LGPL-3.0-or-later', '@img/sharp-libvips-linux-x64').ok,
    ).toBe(true)
  })

  it('does not extend the LGPL-3.0-or-later allowance to an unrelated package', () => {
    const result = evaluatePackageLicenseExpression('LGPL-3.0-or-later', 'some-other-lgpl-package')
    expect(result.ok).toBe(false)
    expect(result.deniedAtoms).toEqual(['LGPL-3.0-or-later'])
  })

  it('does not extend the LGPL-3.0-or-later allowance to a different LGPL version', () => {
    expect(
      evaluatePackageLicenseExpression('LGPL-2.1-or-later', '@img/sharp-libvips-darwin-arm64').ok,
    ).toBe(false)
  })

  it('does not throw on a malformed expression, and fails closed (denies) instead', () => {
    expect(() => evaluatePackageLicenseExpression('(MIT OR Apache-2.0', 'x')).not.toThrow()
    const result = evaluatePackageLicenseExpression('(MIT OR Apache-2.0', 'x')
    expect(result.ok).toBe(false)
    expect(result.deniedAtoms).toEqual(['(MIT OR Apache-2.0'])
  })
})
