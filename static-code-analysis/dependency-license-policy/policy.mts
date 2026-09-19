import {
  collectSpdxAtoms,
  evaluateSpdxExpression,
  parseSpdxExpression,
  type SpdxNode,
} from './spdx-expression.mts'

/**
 * Deny-listed license families (issue #158 part 3): the required minimum
 * (GPL, AGPL, EPL, CDDL, SSPL, BUSL) plus every copyleft family this repo's
 * dependency graph is known to contain (LGPL, MPL) so that a *future*
 * dependency introducing a new, unreviewed LGPL/MPL package — or a
 * different LGPL/MPL version than the two audited exceptions below — fails
 * closed instead of silently passing. The two exceptions already confirmed
 * to carry no obligation (`LGPL-3.0-or-later` scoped to the audited `@img/sharp-*`
 * binary package families, `MPL-2.0` unconditionally) are carved back out via
 * `ALLOWLIST` below.
 *
 * Matched by prefix on the SPDX identifier, not substring, so each family
 * needs its own entry rather than relying on a shared substring: `AGPL` and
 * `LGPL` do not *start with* `GPL`, so a careless `id.includes('GPL')` check
 * would both wrongly flag them *and* wrongly rely on the same prefix that
 * `ALLOWLIST` needs to carve a narrow exception back out of.
 */
const DENY_LICENSE_PREFIXES = ['GPL', 'AGPL', 'LGPL', 'EPL', 'CDDL', 'SSPL', 'BUSL', 'MPL'] as const

/**
 * `pnpm licenses list` reports a package's `package.json` `license` field
 * verbatim, even when that field is not valid SPDX syntax. `geist@1.7.2`
 * ships the literal free-text string `SIL OPEN FONT LICENSE` instead of the
 * SPDX identifier `OFL-1.1` — verified against the real graph, including
 * that `@fontsource/inter` reports the SPDX identifier correctly for the
 * same underlying font license, so this is a per-package packaging quirk,
 * not an SPDX-parser gap. Normalize a known non-SPDX free-text string to
 * its SPDX equivalent before parsing, rather than letting an unparseable
 * string fail closed. Add an entry here only once a new non-SPDX string is
 * confirmed to name exactly one real, unambiguous SPDX license — this is
 * not a place to paper over genuinely ambiguous license text. The key is
 * matched verbatim against the exact string `pnpm licenses list --json`
 * reports today: if a package's next release changes that string's casing
 * or wording (including `geist` itself), the old key stops matching and the
 * gate fails closed on an otherwise-fine package until this map is updated.
 * That is the intended failure direction for a compliance gate — loud and
 * blocking, never a silent pass-through — not a bug to work around.
 */
const KNOWN_LICENSE_ALIASES: Readonly<Record<string, string>> = {
  'SIL OPEN FONT LICENSE': 'OFL-1.1',
}

/**
 * `pnpm licenses list` reports a missing/unrecognized `license` field as the
 * literal string `Unknown`, and an explicit `"license": "UNLICENSED"` as
 * `UNLICENSED` verbatim (verified empirically against a scratch fixture).
 * Both mean "no usable grant" for a *third-party* dependency — this repo's
 * own 386 `UNLICENSED` workspace manifests never appear in the report at
 * all, since `pnpm licenses list` only reports resolved third-party
 * packages under `.pnpm`, not the workspace projects themselves (verified
 * against the real graph: 0 of 1,332 entries resolve to a non-`.pnpm` path).
 */
const DENY_LICENSE_EXACT = ['UNLICENSED', 'Unknown', ''] as const

interface AllowlistEntry {
  /** Exact SPDX id this entry allows. */
  readonly licenseId: string
  /** When set, the allowance only applies to packages whose name matches. */
  readonly packageNamePattern?: RegExp
  /** Why this copyleft license does not trigger an obligation here. */
  readonly reason: string
}

/**
 * Copyleft licenses the audit behind issue #158 found in the real dependency
 * graph, confirmed to carry no obligation (nothing vendored, no build output
 * committed), and allowlisted rather than denied. The sharp scope includes
 * libvips bundles plus the Windows and WASM package variants whose manifests
 * declare the same LGPL-3.0-or-later component. Keep entries narrow and
 * justified — see the Guard Authoring Checklist in
 * `static-code-analysis/README.md`.
 */
const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    licenseId: 'MPL-2.0',
    reason:
      'File-level weak copyleft: modifications to MPL-2.0 files themselves would need to stay ' +
      'open, but using the package as a dependency (as every current MPL-2.0 entry is used here — ' +
      '@ghostery/*, @remusao/*, satori, web-push, lightningcss, axe-core) creates no obligation on ' +
      'this repository. Allowlisted for any package, not scoped by name.',
  },
  {
    licenseId: 'LGPL-3.0-or-later',
    packageNamePattern:
      /^@img\/sharp-(?:libvips-(?:darwin-(?:arm64|x64)|linux-(?:arm|arm64|ppc64|riscv64|s390x|x64)|linuxmusl-(?:arm64|x64))|wasm32|win32-(?:arm64|ia32|x64))$/,
    reason:
      "sharp's audited libvips bundles and Windows/WASM package variants carry LGPL-3.0-or-later " +
      'as a component license. This repository neither modifies nor vendors their source or commits ' +
      'a build artifact. The exact package-family scope keeps every other LGPL-3.0-or-later ' +
      'dependency subject to review.',
  },
]

function isDeniedAtom(atomId: string): boolean {
  if ((DENY_LICENSE_EXACT as readonly string[]).includes(atomId)) return true
  return DENY_LICENSE_PREFIXES.some(prefix => atomId.startsWith(prefix))
}

function isAllowlistedAtom(atomId: string, packageName: string): boolean {
  return ALLOWLIST.some(
    entry =>
      entry.licenseId === atomId &&
      (!entry.packageNamePattern || entry.packageNamePattern.test(packageName)),
  )
}

function isAtomOkForPackage(atomId: string, packageName: string): boolean {
  if (isAllowlistedAtom(atomId, packageName)) return true
  return !isDeniedAtom(atomId)
}

export interface LicenseEvaluation {
  ok: boolean
  /** Set when `ok` is false: the exact atom(s) that failed, for diagnostics. */
  deniedAtoms: string[]
}

/**
 * Evaluates one package's license expression against the deny/allow policy.
 * Malformed expressions, unknown SPDX identifiers, and custom license
 * references never throw out of this boundary: they fail closed (denied)
 * instead of being evaluated against the deny/allow rules at all, since a
 * string this check cannot classify might be hiding a denied license.
 */
export function evaluatePackageLicenseExpression(
  licenseExpression: string,
  packageName: string,
): LicenseEvaluation {
  const normalizedExpression = KNOWN_LICENSE_ALIASES[licenseExpression] ?? licenseExpression
  let node: SpdxNode
  try {
    node = parseSpdxExpression(normalizedExpression)
  } catch {
    // Invalid or unrecognized expression: fail closed rather than silently
    // defaulting to "allowed" for a string this check could not understand.
    // A safe sentinel for a compliance gate means never passing something
    // unrecognized, not passing by default.
    return { ok: false, deniedAtoms: [licenseExpression] }
  }

  const isAtomOk = (atomId: string): boolean => isAtomOkForPackage(atomId, packageName)
  const ok = evaluateSpdxExpression(node, isAtomOk)
  // Only walk every atom (instead of relying on evaluateSpdxExpression's
  // short-circuiting OR/AND) when reporting a failure, so the diagnostic
  // lists every denied atom, not just the first one an OR/AND happened to
  // visit before short-circuiting.
  const deniedAtoms = ok ? [] : collectSpdxAtoms(node).filter(atomId => !isAtomOk(atomId))

  return { ok, deniedAtoms }
}
