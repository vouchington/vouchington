import { describe, expect, it } from 'vitest'
import { evaluatePackageLicenseExpression } from 'vouchington-tooling/dependency-license-policy'

import { dependencyLicensePolicy } from './policy.mts'

function evaluate(licenseExpression: string, packageName: string) {
  return evaluatePackageLicenseExpression(licenseExpression, packageName, dependencyLicensePolicy)
}

describe('dependencyLicensePolicy', () => {
  it('allows common permissive licenses and the known font-license alias', () => {
    expect(evaluate('MIT', 'left-pad').ok).toBe(true)
    expect(evaluate('Apache-2.0', 'some-lib').ok).toBe(true)
    expect(evaluate('SIL OPEN FONT LICENSE', 'geist').ok).toBe(true)
  })

  it('denies copyleft license prefixes', () => {
    expect(evaluate('GPL-3.0-only', 'copyleft-lib').ok).toBe(false)
  })

  it('allows MPL-2.0 for every package', () => {
    expect(evaluate('MPL-2.0', '@ghostery/adblocker').ok).toBe(true)
    expect(evaluate('MPL-2.0', 'another-package').ok).toBe(true)
  })

  it('allows LGPL-3.0-or-later only for the exact audited Sharp packages', () => {
    const sharpAllowlist = dependencyLicensePolicy.allowlist?.find(
      entry => entry.licenseId === 'LGPL-3.0-or-later',
    )
    expect(sharpAllowlist?.scope).toMatchObject({ kind: 'exact' })
    expect(
      sharpAllowlist?.scope.kind === 'exact' ? sharpAllowlist.scope.packageNames : [],
    ).toHaveLength(14)
    expect(evaluate('LGPL-3.0-or-later', '@img/sharp-libvips-linux-x64').ok).toBe(true)
    expect(evaluate('LGPL-3.0-or-later', '@img/sharp-win32-x64').ok).toBe(true)
    expect(evaluate('LGPL-3.0-or-later', '@img/sharp-libvips-future-platform').ok).toBe(false)
    expect(evaluate('LGPL-2.1-or-later', '@img/sharp-libvips-linux-x64').ok).toBe(false)
  })
})
