import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from 'no-mistakes'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type Group = {
  patterns?: string[]
}

type Update = {
  cooldown?: { exclude?: string[] }
  directory?: string
  groups?: Record<string, Group>
  'open-pull-requests-limit'?: number
  'package-ecosystem'?: string
}

type NoMistakesRule = {
  name?: string
  options?: ReleaseAgeOptions
}

type ReleaseAgeOptions = {
  permanentPackages?: { name?: string }[]
  temporaryGroups?: { selectors?: string[] }[]
  temporarySelectors?: string[]
}

function readYamlFile(path: string): unknown {
  return parseYaml(readFileSync(`${repoRoot}/${path}`, 'utf8')) as unknown
}

function readDependabotUpdates(): Update[] {
  return (readYamlFile('.github/dependabot.yml') as { updates?: Update[] }).updates ?? []
}

const noMistakesConfig = (await resolveConfig({ root: repoRoot, view: 'declared' })) as {
  rules?: NoMistakesRule[]
}

function readReleaseAgePolicy(): ReleaseAgeOptions {
  const rules = noMistakesConfig.rules ?? []
  return (
    rules.find(rule => rule.name === 'first-party package release-age exemptions stay synchronized')
      ?.options ?? {}
  )
}

function readPermanentPackages(): string[] {
  return (readReleaseAgePolicy().permanentPackages ?? [])
    .map(entry => entry.name)
    .filter((name): name is string => typeof name === 'string')
}

function firstPartyDependabotPatterns(permanentPackages: string[]): string[] {
  return [
    ...new Set(
      permanentPackages.map(packageName => {
        if (packageName.startsWith('@jongleberry/')) return '@jongleberry/*'
        if (packageName.startsWith('@vouchington/')) return '@vouchington/*'
        return packageName
      }),
    ),
  ]
}

function readTemporarySelectors(): string[] {
  const policy = readReleaseAgePolicy()
  return [
    ...(policy.temporarySelectors ?? []),
    ...(policy.temporaryGroups ?? []).flatMap(group => group.selectors ?? []),
  ]
}

function readWorkspaceReleaseAgeExclusions(): string[] {
  return (
    (readYamlFile('pnpm-workspace.yaml') as { minimumReleaseAgeExclude?: string[] })
      .minimumReleaseAgeExclude ?? []
  )
}

describe('Dependabot policy', () => {
  it('covers every ecosystem with a bounded version-update queue', () => {
    const updates = readDependabotUpdates()

    expect(
      updates
        .map(update => [update['package-ecosystem'], update.directory])
        .toSorted((a, b) => Number(String(a) > String(b)) - Number(String(a) < String(b))),
    ).toEqual(
      [
        ['docker', '/backend'],
        ['docker', '/web'],
        ['github-actions', '/'],
        ['npm', '/'],
      ].toSorted((a, b) => Number(String(a) > String(b)) - Number(String(a) < String(b))),
    )

    for (const update of updates) {
      expect(update['open-pull-requests-limit']).toBeGreaterThanOrEqual(1)
      expect(update['open-pull-requests-limit']).toBeLessThanOrEqual(5)
    }
  })

  it('keeps approved first-party cooldown and grouping patterns synchronized', () => {
    const rootNpmUpdate = readDependabotUpdates().find(
      update => update['package-ecosystem'] === 'npm' && update.directory === '/',
    )
    const exclusions = rootNpmUpdate?.cooldown?.exclude ?? []
    const firstParty = rootNpmUpdate?.groups?.['first-party']?.patterns ?? []
    const permanentPackages = readPermanentPackages()
    const temporarySelectors = readTemporarySelectors()
    const workspaceExclusions = readWorkspaceReleaseAgeExclusions()
    const expectedPatterns = firstPartyDependabotPatterns(permanentPackages)

    expect(exclusions.toSorted()).toEqual(expectedPatterns.toSorted())
    expect(firstParty.toSorted()).toEqual(expectedPatterns.toSorted())
    expect(workspaceExclusions.toSorted()).toEqual(
      [...permanentPackages, ...temporarySelectors].toSorted(),
    )
    expect(exclusions).toEqual(expect.arrayContaining(['@jongleberry/*', '@vouchington/*']))
    expect(exclusions.filter(pattern => !pattern.startsWith('@')).toSorted()).toEqual(
      permanentPackages.filter(packageName => !packageName.startsWith('@')).toSorted(),
    )
  })
})
