import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// GHSA-jqcg-44mw-7w3h: proxy-addr >= 1.1.0 and < 2.0.8 trusts every IPv4 address for a
// short-prefix IPv4-mapped IPv6 subnet. express@5.2.1 allows ^2.0.7, so the lockfile is the pin.
const ADVISORY_MIN = [1, 1, 0] as const
const PATCHED = [2, 0, 8] as const

function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function parseVersion(version: string): number[] | null {
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u.exec(version)
  if (!match?.groups) return null
  return [Number(match.groups.major), Number(match.groups.minor), Number(match.groups.patch)]
}

function isVulnerable(version: string): boolean {
  const parsed = parseVersion(version)
  if (!parsed) return false
  return compareVersions(parsed, ADVISORY_MIN) >= 0 && compareVersions(parsed, PATCHED) < 0
}

/** Resolved package keys and dependency pins. Specifiers are ranges, not installed versions. */
function vulnerableProxyAddrVersions(lockfile: string): string[] {
  const versions = new Set<string>()
  for (const line of lockfile.split('\n')) {
    const packageKey = /^ {2}proxy-addr@(?<version>\d+\.\d+\.\d+):$/u.exec(line)
    const dependency = /^ {6}proxy-addr: (?<version>\d+\.\d+\.\d+)\b/u.exec(line)
    const version = packageKey?.groups?.version ?? dependency?.groups?.version
    if (version && isVulnerable(version)) versions.add(version)
  }
  return [...versions].toSorted()
}

describe('proxy-addr advisory resolution', () => {
  it('rejects a lockfile that still resolves the GHSA-jqcg-44mw-7w3h range', () => {
    const lockfile = [
      'packages:',
      '  proxy-addr@2.0.7:',
      '  express@5.2.1:',
      '    dependencies:',
      '      proxy-addr: 2.0.7',
      '  proxy-addr@1.0.10:',
      '    dependencies:',
      '      proxy-addr: 1.0.10',
    ].join('\n')

    expect(vulnerableProxyAddrVersions(lockfile)).toEqual(['2.0.7'])
  })

  it('accepts the patched 2.0.8 resolution', () => {
    const lockfile = [
      'packages:',
      '  proxy-addr@2.0.8:',
      '  express@5.2.1:',
      '    dependencies:',
      '      proxy-addr: 2.0.8',
    ].join('\n')

    expect(vulnerableProxyAddrVersions(lockfile)).toEqual([])
  })

  it('keeps every resolved proxy-addr outside the advisory range', () => {
    expect(vulnerableProxyAddrVersions(readFileSync(`${repoRoot}/pnpm-lock.yaml`, 'utf8'))).toEqual(
      [],
    )
  })
})
