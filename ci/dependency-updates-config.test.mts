import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type RenovateRegexManager = {
  customType?: string
  datasourceTemplate?: string
  depNameTemplate?: string
  description?: string
  managerFilePatterns?: string[]
  matchStrings?: string[]
}

type RenovatePackageRule = {
  automerge?: boolean
  internalChecksFilter?: string
  matchDepNames?: string[]
  matchManagers?: string[]
  minimumReleaseAge?: string
}

type DependabotUpdate = {
  directory?: string
  groups?: Record<string, { patterns?: string[] }>
  ignore?: Array<{ 'dependency-name'?: string; versions?: string[] }>
  'package-ecosystem'?: string
  cooldown?: {
    'default-days'?: number
  }
  'open-pull-requests-limit'?: number
  'rebase-strategy'?: string
}

type DependabotConfig = {
  updates?: DependabotUpdate[]
}

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

function parseExactVersion(value: string): readonly [number, number, number] | undefined {
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/.exec(value)
  if (!match?.groups) return undefined

  const version = [match.groups.major, match.groups.minor, match.groups.patch].map(Number)
  if (!version.every(Number.isSafeInteger)) return undefined

  return version as [number, number, number]
}

function exactVersionIsAtLeast(value: string, minimum: string): boolean {
  const version = parseExactVersion(value)
  const floor = parseExactVersion(minimum)
  if (!version || !floor) return false

  for (const index of [0, 1, 2] as const) {
    if (version[index] > floor[index]) return true
    if (version[index] < floor[index]) return false
  }
  return true
}

describe('dependency update configuration', () => {
  it('requires human merge decisions for dependency-bot PRs', () => {
    const renovate = JSON.parse(readRepoFile('renovate.json')) as {
      automerge?: boolean
      platformAutomerge?: boolean
      packageRules?: RenovatePackageRule[]
    }

    expect(renovate.automerge).toBe(false)
    expect(renovate.platformAutomerge).toBeUndefined()
    expect(renovate.packageRules?.every(rule => rule.automerge !== true)).toBe(true)
    expect(existsSync(`${repoRoot}/.github/workflows/dependabot-pr-automerge.yml`)).toBe(false)
  })

  it('keeps Playwright consumers synchronized without a compatibility hold', () => {
    const dependabot = parseYaml(readRepoFile('.github/dependabot.yml')) as DependabotConfig
    const rootNpmUpdate = dependabot.updates?.find(
      update => update['package-ecosystem'] === 'npm' && update.directory === '/',
    )
    const ignoredVersions = Object.fromEntries(
      rootNpmUpdate?.ignore?.map(entry => [entry['dependency-name'], entry.versions]) ?? [],
    )
    const rootPackage = JSON.parse(readRepoFile('package.json')) as {
      devDependencies?: Record<string, string>
    }
    const browserCrawlPackage = JSON.parse(
      readRepoFile('backend/services/browser-crawl/package.json'),
    ) as { dependencies?: Record<string, string> }
    const webPackage = JSON.parse(readRepoFile('web/package.json')) as {
      devDependencies?: Record<string, string>
    }

    const playwrightVersions = [
      rootPackage.devDependencies?.['@playwright/test'],
      rootPackage.devDependencies?.playwright,
      rootPackage.devDependencies?.['playwright-core'],
      webPackage.devDependencies?.['@playwright/test'],
      browserCrawlPackage.dependencies?.playwright,
      browserCrawlPackage.dependencies?.['playwright-core'],
    ]
    expect(playwrightVersions[0]).toMatch(/^\d+\.\d+\.\d+$/)
    expect(playwrightVersions).toEqual(playwrightVersions.map(() => playwrightVersions[0]))
    expect(ignoredVersions).not.toHaveProperty('@playwright/test')
    expect(ignoredVersions).not.toHaveProperty('playwright')
    expect(ignoredVersions).not.toHaveProperty('playwright-core')
  })

  it('contains the Sentry 10.72/10.73 jsdom regression while allowing later candidates', () => {
    const dependabot = parseYaml(readRepoFile('.github/dependabot.yml')) as DependabotConfig
    const rootNpmUpdate = dependabot.updates?.find(
      update => update['package-ecosystem'] === 'npm' && update.directory === '/',
    )
    const ignoredVersions = Object.fromEntries(
      rootNpmUpdate?.ignore?.map(entry => [entry['dependency-name'], entry.versions]) ?? [],
    )
    const sentryHold = ['10.72.x', '10.73.x']
    const sentryManifests = [
      {
        path: 'web/package.json',
        name: '@sentry/nextjs',
        field: 'dependencies',
      },
      {
        path: 'backend/modules/on-error/package.json',
        name: '@sentry/node',
        field: 'dependencies',
      },
      {
        path: 'backend/test-helpers/package.json',
        name: '@sentry/node',
        field: 'dependencies',
      },
      {
        path: 'cloudflare-worker/package.json',
        name: '@sentry/cloudflare',
        field: 'dependencies',
      },
      {
        path: 'lambdas/shared/package.json',
        name: '@sentry/aws-serverless',
        field: 'dependencies',
      },
    ] as const

    const sentryVersions = sentryManifests.map(({ path, name, field }) => {
      const manifest = JSON.parse(readRepoFile(path)) as Record<
        string,
        Record<string, string> | undefined
      >
      return manifest[field]?.[name]
    })

    expect(sentryVersions[0]).toMatch(/^\d+\.\d+\.\d+$/)
    expect(sentryVersions).toEqual(sentryVersions.map(() => sentryVersions[0]))
    expect(ignoredVersions).toMatchObject({
      '@sentry/nextjs': sentryHold,
      '@sentry/node': sentryHold,
      '@sentry/cloudflare': sentryHold,
      '@sentry/aws-serverless': sentryHold,
    })
    expect(readRepoFile('pnpm-lock.yaml')).not.toMatch(
      /@sentry\/(?:nextjs|node|cloudflare|aws-serverless)@10\.7[23]\./,
    )
  })

  it('keeps the published Node engine floor separate from the Node 26 toolchain and deployment pins', () => {
    const applicationManifests = [
      'package.json',
      'backend/package.json',
      'cloudflare-worker/package.json',
    ]

    for (const path of applicationManifests) {
      const manifest = JSON.parse(readRepoFile(path)) as {
        engines?: { node?: string }
      }

      expect(manifest.engines?.node).toBe('>=24.16.0')
    }

    expect(readRepoFile('.nvmrc').trim()).toBe('26')
    expect(readRepoFile('backend/Dockerfile')).toContain(
      'FROM mirror.gcr.io/library/node:26-trixie-slim AS base-node',
    )
  })

  it('keeps the type-aware Oxlint companion in the OXC Dependabot group', () => {
    const dependabot = parseYaml(readRepoFile('.github/dependabot.yml')) as DependabotConfig
    const rootNpmUpdates =
      dependabot.updates?.filter(
        update => update['package-ecosystem'] === 'npm' && update.directory === '/',
      ) ?? []

    expect(rootNpmUpdates).toHaveLength(1)
    expect(rootNpmUpdates[0]?.groups?.oxc?.patterns).toEqual(
      expect.arrayContaining(['oxlint', 'oxfmt', 'oxlint-tsgolint']),
    )
  })

  it('requires a pnpm version with reliable repeat-install lockfile detection', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as { packageManager?: string }
    const match = /^pnpm@(?<version>\d+\.\d+\.\d+)$/.exec(pkg.packageManager ?? '')
    const version = match?.groups?.version

    expect(exactVersionIsAtLeast('11.7.99', '11.8.0')).toBe(false)
    expect(exactVersionIsAtLeast('11.8.0', '11.8.0')).toBe(true)
    expect(exactVersionIsAtLeast('12.0.0', '11.8.0')).toBe(true)
    expect(exactVersionIsAtLeast('10.8.99', '11.8.0')).toBe(false)
    expect(exactVersionIsAtLeast('invalid', '11.8.0')).toBe(false)
    expect(parseExactVersion(version ?? '')).toBeDefined()
    expect(exactVersionIsAtLeast(version ?? '', '11.8.0')).toBe(true)
  })

  it('assigns the root packageManager pnpm pin to a focused Renovate manager', () => {
    const renovate = JSON.parse(readRepoFile('renovate.json')) as {
      customManagers?: RenovateRegexManager[]
      enabledManagers?: string[]
      packageRules?: RenovatePackageRule[]
    }
    const managers =
      renovate.customManagers?.filter(
        manager =>
          manager.customType === 'regex' &&
          manager.datasourceTemplate === 'npm' &&
          manager.depNameTemplate === 'pnpm',
      ) ?? []

    expect(renovate.enabledManagers).toContain('custom.regex')
    expect(managers).toHaveLength(1)

    const manager = managers[0]
    expect(manager?.managerFilePatterns).toEqual([String.raw`/^package\.json$/`])
    expect(manager?.matchStrings).toHaveLength(1)

    const match = new RegExp(manager?.matchStrings?.[0] ?? '').exec(readRepoFile('package.json'))
    expect(match?.groups?.currentValue).toMatch(/^\d+\.\d+\.\d+$/)
    expect(`pnpm@${match?.groups?.currentValue}`).toBe(
      (JSON.parse(readRepoFile('package.json')) as { packageManager: string }).packageManager,
    )

    const pnpmRules =
      renovate.packageRules?.filter(
        rule =>
          rule.matchManagers?.includes('custom.regex') && rule.matchDepNames?.includes('pnpm'),
      ) ?? []
    expect(pnpmRules).toHaveLength(1)
    expect(pnpmRules[0]).toMatchObject({
      internalChecksFilter: 'strict',
      matchDepNames: ['pnpm'],
      matchManagers: ['custom.regex'],
      minimumReleaseAge: '2 days',
    })
  })

  it('keeps every configured release delay at two days', () => {
    const workspace = parseYaml(readRepoFile('pnpm-workspace.yaml')) as {
      minimumReleaseAge?: number
    }
    const dependabot = parseYaml(readRepoFile('.github/dependabot.yml')) as DependabotConfig
    const renovate = JSON.parse(readRepoFile('renovate.json')) as {
      packageRules?: RenovatePackageRule[]
    }
    const cooldowns =
      dependabot.updates?.flatMap(update =>
        update.cooldown ? [update.cooldown['default-days']] : [],
      ) ?? []
    const renovateReleaseAges =
      renovate.packageRules?.flatMap(rule =>
        rule.minimumReleaseAge === undefined ? [] : [rule.minimumReleaseAge],
      ) ?? []
    const pnpmRule = renovate.packageRules?.find(
      rule => rule.matchManagers?.includes('custom.regex') && rule.matchDepNames?.includes('pnpm'),
    )

    expect(workspace.minimumReleaseAge).toBe(2880)
    expect(cooldowns).toHaveLength(dependabot.updates?.length ?? 0)
    expect(cooldowns.every(days => days === 2)).toBe(true)
    expect(renovateReleaseAges).toEqual(['2 days'])
    expect(pnpmRule?.minimumReleaseAge).toBe('2 days')
  })
})
