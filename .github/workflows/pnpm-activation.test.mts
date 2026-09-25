import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { inlineLocalComposites, stepLists, type PolicyStep } from './pnpm-policy.test-helpers.mts'

const isNodeSetup = (step: PolicyStep) => step.uses?.startsWith('actions/setup-node@') === true
const isPnpmSetup = (step: PolicyStep) => step.uses?.startsWith('pnpm/action-setup@') === true
const manualActivationPattern = /\bcorepack\b|\bnpm\s+(?:install|i|add)\b[^\n]*\bpnpm(?:@|\s|$)/m

const pnpmSetups = stepLists.flatMap(({ owner, steps }) => {
  const inlined = inlineLocalComposites(steps)
  return inlined.flatMap((step, index) =>
    isPnpmSetup(step) ? [{ owner, step, prior: inlined.slice(0, index) }] : [],
  )
})
const ciPnpmVersion = String(pnpmSetups[0]?.step.with?.version)
const ciPnpmMajor = /^latest-(\d+)$/.exec(ciPnpmVersion)?.[1]

describe('pnpm activation via pnpm/action-setup', () => {
  it('has pnpm/action-setup call sites to validate', () => {
    expect(pnpmSetups.length).toBeGreaterThan(0)
  })

  it('runs actions/setup-node before every pnpm/action-setup', () => {
    // pnpm/action-setup picks its pnpm bootstrap from the Node on PATH, and the pnpm shims it
    // writes run that Node, so the .nvmrc Node must already be active.
    const offenders = pnpmSetups.filter(setup => !setup.prior.some(isNodeSetup))
    expect(offenders.map(setup => setup.owner)).toEqual([])
  })

  it('passes only latest-<major>, the same one at every call site', () => {
    // `latest-<major>` self-updates to the newest release in that line that pnpm's
    // minimumReleaseAge admits. A bare major keeps the action's bundled release (12.3.4 in v6.1.0,
    // whose `pnpm dlx` fails on ignored build scripts), `standalone` swaps in a bundled Node, and
    // `run_install` bypasses the setup-node-pnpm install step.
    const offenders = pnpmSetups.filter(
      ({ step }) =>
        Object.keys(step.with ?? {}).join() !== 'version' ||
        !/^latest-\d+$/.test(String(step.with?.version)),
    )
    expect(offenders.map(setup => setup.owner)).toEqual([])
    expect(new Set(pnpmSetups.map(({ step }) => String(step.with?.version)))).toEqual(
      new Set([ciPnpmVersion]),
    )
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
    ['npm install --prefix "$dir" pnpm@12', true],
    ['npm i -g pnpm', true],
    ['pnpm install --frozen-lockfile', false],
    ['npm install --no-save left-pad', false],
  ])('classifies manual activation example %s', (run, expected) => {
    expect(manualActivationPattern.test(run)).toBe(expected)
  })
})
