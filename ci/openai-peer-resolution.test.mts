import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * pnpm puts each optional peer version in the dependent's instance key. `openai` peers `undici`,
 * and `instanceof APIError` is false across two of those instances. Direct workspace `undici`
 * and every auto-installed `openai` peer must therefore be one version.
 */
function peerResolutionError(lockfile: string): string | null {
  const openaiVersions = unique(importerDependencyVersions(lockfile, 'openai'))
  const undiciVersions = unique(importerDependencyVersions(lockfile, 'undici'))
  const instances = unique(openaiPackageInstances(lockfile))

  if (openaiVersions.length !== 1) {
    return `expected one openai instance, found ${openaiVersions.join(' | ') || 'none'}`
  }
  if (undiciVersions.length !== 1) {
    return `expected one direct undici version, found ${undiciVersions.join(' | ') || 'none'}`
  }

  const openaiVersion = openaiVersions[0]
  if (openaiVersion === undefined) return 'expected one openai instance, found none'
  const peerUndici = /(?:^|\()undici@(?<version>\d+\.\d+\.\d+)(?:\)|$)/.exec(openaiVersion)?.groups
    ?.version
  if (peerUndici !== undiciVersions[0]) {
    return `openai peers undici@${peerUndici ?? 'missing'}, direct undici is ${undiciVersions[0]}`
  }
  if (instances.length !== 1 || instances[0] !== `openai@${openaiVersion}`) {
    return `openai package instances diverged: ${instances.join(' | ') || 'none'}`
  }
  return null
}

function importerDependencyVersions(lockfile: string, name: string): string[] {
  const versions: string[] = []
  let current: string | undefined
  for (const line of lockfile.split('\n')) {
    if (line === 'packages:') break
    const dependency = /^ {6}(?<dependency>[^:\s]+):$/.exec(line)
    if (dependency?.groups?.dependency) {
      current = dependency.groups.dependency
      continue
    }
    if (current !== name) continue
    const version = /^ {8}version: (?<version>\S+)$/.exec(line)
    if (version?.groups?.version) versions.push(version.groups.version)
  }
  return versions
}

function openaiPackageInstances(lockfile: string): string[] {
  const keys: string[] = []
  let inPackages = false
  for (const line of lockfile.split('\n')) {
    if (line === 'packages:') {
      inPackages = true
      continue
    }
    if (!inPackages) continue
    const match = /^ {2}(?<key>openai@\S+\([^)]+\)):$/.exec(line)
    if (match?.groups?.key) keys.push(match.groups.key)
  }
  return keys
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted()
}

const splitPeers = `importers:

  helpers:
    dependencies:
      openai:
        specifier: ^1.0.0
        version: 1.0.0(undici@1.0.1)
      undici:
        specifier: ^1.0.1
        version: 1.0.1

  utils:
    dependencies:
      openai:
        specifier: ^1.0.0
        version: 1.0.0(undici@1.0.0)

packages:

  openai@1.0.0(undici@1.0.0):
    optionalDependencies:
      undici: 1.0.0

  openai@1.0.0(undici@1.0.1):
    optionalDependencies:
      undici: 1.0.1
`

const peerLeftBehind = `importers:

  app:
    dependencies:
      openai:
        specifier: ^1.0.0
        version: 1.0.0(undici@1.0.0)
      undici:
        specifier: ^1.0.1
        version: 1.0.1

packages:

  openai@1.0.0(undici@1.0.0):
    optionalDependencies:
      undici: 1.0.0
`

const alignedPeers = `importers:

  helpers:
    dependencies:
      openai:
        specifier: ^1.0.0
        version: 1.0.0(undici@1.0.1)
      undici:
        specifier: ^1.0.1
        version: 1.0.1

  utils:
    dependencies:
      openai:
        specifier: ^1.0.0
        version: 1.0.0(undici@1.0.1)

packages:

  openai@1.0.0:
    resolution: {integrity: sha512-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}

  openai@1.0.0(undici@1.0.1):
    optionalDependencies:
      undici: 1.0.1
`

describe('openai undici peer resolution', () => {
  it('rejects two openai instances created by different undici peers', () => {
    expect(peerResolutionError(splitPeers)).toBe(
      'expected one openai instance, found 1.0.0(undici@1.0.0) | 1.0.0(undici@1.0.1)',
    )
  })

  it('rejects a direct undici bump that leaves the openai peer behind', () => {
    expect(peerResolutionError(peerLeftBehind)).toBe(
      'openai peers undici@1.0.0, direct undici is 1.0.1',
    )
  })

  it('accepts one openai instance peered at the direct undici version', () => {
    expect(peerResolutionError(alignedPeers)).toBeNull()
  })

  it('keeps the workspace lockfile on one openai instance', () => {
    expect(peerResolutionError(readFileSync(`${repoRoot}/pnpm-lock.yaml`, 'utf8'))).toBeNull()
  })
})
