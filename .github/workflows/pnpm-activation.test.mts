import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import {
  inlineLocalComposites,
  stepLists,
  type PolicyStep,
} from '../test-helpers/pnpm-policy.fixtures.mts'

const isNodeSetup = (step: PolicyStep) => step.uses?.startsWith('actions/setup-node@') === true
const isPnpmSetup = (step: PolicyStep) => step.uses?.startsWith('pnpm/setup@') === true
const manualActivationPattern = /\bcorepack\b|\bnpm\s+(?:install|i|add)\b[^\n]*\bpnpm(?:@|\s|$)/m

const pnpmSetups = stepLists.flatMap(({ owner, steps }) => {
  const inlined = inlineLocalComposites(steps)
  return inlined.flatMap((step, index) =>
    isPnpmSetup(step) ? [{ owner, step, prior: inlined.slice(0, index) }] : [],
  )
})
const ciPnpmVersion = String(pnpmSetups[0]?.step.with?.version)
const ciPnpmMajor = /^(\d+)\.\d+\.\d+$/.exec(ciPnpmVersion)?.[1]

describe('pnpm activation via pnpm/setup', () => {
  it('has pnpm/setup call sites to validate', () => {
    expect(pnpmSetups.length).toBeGreaterThan(0)
  })

  it('runs actions/setup-node before every pnpm/setup without replacing the project Node', () => {
    // pnpm/setup owns only the pnpm executable; setup-node continues to own Node for project scripts.
    const offenders = pnpmSetups.filter(setup => !setup.prior.some(isNodeSetup))
    expect(offenders.map(setup => setup.owner)).toEqual([])
  })

  it('passes one exact pnpm 12 version and disables action-owned runtime/install work', () => {
    const offenders = pnpmSetups.filter(
      ({ step }) =>
        Object.keys(step.with ?? {})
          .toSorted()
          .join() !== ['install', 'node-version-file', 'version'].toSorted().join() ||
        step.with?.install !== false ||
        step.with?.['node-version-file'] !== false ||
        !/^12\.\d+\.\d+$/.test(String(step.with?.version)),
    )
    expect(offenders.map(setup => setup.owner)).toEqual([])
    expect(new Set(pnpmSetups.map(({ step }) => String(step.with?.version)))).toEqual(
      new Set([ciPnpmVersion]),
    )
  })

  it('uses the supported pnpm/setup v3 action at every call site', () => {
    expect(
      pnpmSetups.every(({ step }) => /^pnpm\/setup@[0-9a-f]{40}$/.test(String(step.uses))),
    ).toBe(true)
  })

  it('lets Renovate update every exact pnpm input under the workspace release policy', () => {
    const renovate = JSON.parse(readFileSync('renovate.json', 'utf8')) as {
      customManagers?: Array<{
        managerFilePatterns?: string[]
        matchStrings?: string[]
      }>
      packageRules?: Array<{
        allowedVersions?: string
        groupName?: string
        matchManagers?: string[]
        matchPackageNames?: string[]
        minimumReleaseAge?: string
      }>
    }
    const workflowInputManager = renovate.customManagers?.find(
      manager =>
        manager.managerFilePatterns?.includes('.github/workflows/*.yml') &&
        manager.managerFilePatterns?.includes('.github/actions/*/action.yml') &&
        manager.matchStrings?.some(pattern => pattern.includes('(?<currentValue>')),
    )
    const pnpmRule = renovate.packageRules?.find(
      rule =>
        rule.matchManagers?.includes('custom.regex') && rule.matchPackageNames?.includes('pnpm'),
    )
    const inputFiles = [
      '.github/actions/setup-node-pnpm/action.yml',
      '.github/actions/build-backend-images/action.yml',
      '.github/workflows/initialize-smoke-test.yml',
      '.github/workflows/postgresql-snapshot-update.yml',
    ]
    const managerPattern = workflowInputManager?.matchStrings?.[0]
    const matches = inputFiles.map(path =>
      managerPattern ? new RegExp(managerPattern).exec(readFileSync(path, 'utf8')) : null,
    )
    const declaredSetups = stepLists.flatMap(({ steps }) => steps.filter(isPnpmSetup))

    expect(workflowInputManager).toBeDefined()
    expect(matches).toHaveLength(declaredSetups.length)
    expect(matches.map(match => [match?.groups?.datasource, match?.groups?.depName])).toEqual(
      inputFiles.map(() => ['npm', 'pnpm']),
    )
    expect(pnpmRule).toMatchObject({
      allowedVersions: '12.x',
      minimumReleaseAge: '2 days',
      groupName: 'pnpm CI toolchain',
    })
  })

  it.each(['backend/Dockerfile', 'web/Dockerfile'])('installs the CI pnpm major in %s', path => {
    expect(/^ARG PNPM_VERSION=(\S+)$/m.exec(readFileSync(path, 'utf8'))?.[1]).toBe(ciPnpmMajor)
  })

  it('does not pin pnpm in the root package.json', () => {
    // An enforced pin makes pnpm 12 prepend a packageManagerDependencies document to
    // pnpm-lock.yaml, which single-document lockfile readers and GitHub's dependency graph miss.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      devEngines?: { packageManager?: unknown }
      packageManager?: unknown
    }
    expect(pkg.packageManager).toBeUndefined()
    expect(pkg.devEngines?.packageManager).toBeUndefined()
  })

  it('sets up pnpm at most once per job or composite action', () => {
    // setup-backend wraps setup-node-pnpm, so calling both in one job repeats the whole Node,
    // pnpm, store-cache, and install setup; one setup owner per job must cover every later step.
    const counts = Map.groupBy(pnpmSetups, setup => setup.owner)
    const repeated = [...counts].flatMap(([owner, setups]) =>
      setups.length > 1 ? [`${owner}: ${setups.length}`] : [],
    )
    expect(repeated).toEqual([])
  })

  it('never activates pnpm through corepack or npm', () => {
    const offenders = stepLists.filter(({ steps }) =>
      steps.some(step => manualActivationPattern.test(step.run ?? '')),
    )
    expect(offenders.map(list => list.owner)).toEqual([])
  })

  it.each([
    ['corepack enable pnpm', true],
    ['npm install --prefix "$dir" pnpm@latest', true],
    ['npm i -g pnpm', true],
    ['pnpm install --frozen-lockfile', false],
    ['npm install --no-save left-pad', false],
  ])('classifies manual activation example %s', (run, expected) => {
    expect(manualActivationPattern.test(run)).toBe(expected)
  })
})
