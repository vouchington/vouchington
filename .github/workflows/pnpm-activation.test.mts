import { describe, expect, it } from 'vitest'
import {
  inlineLocalComposites,
  stepLists,
  type PolicyStep,
} from '../test-helpers/pnpm-policy.test-helpers.mts'

const isNodeSetup = (step: PolicyStep) => step.uses?.startsWith('actions/setup-node@') === true
const isPnpmSetup = (step: PolicyStep) => step.uses?.startsWith('pnpm/action-setup@') === true
const manualActivationPattern = /\bcorepack\b|\bnpm\s+(?:install|i|add)\b[^\n]*\bpnpm(?:@|\s|$)/m

const pnpmSetups = stepLists.flatMap(({ owner, steps }) => {
  const inlined = inlineLocalComposites(steps)
  return inlined.flatMap((step, index) =>
    isPnpmSetup(step) ? [{ owner, step, prior: inlined.slice(0, index) }] : [],
  )
})

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

  it('passes no inputs, so the version comes from package.json#packageManager', () => {
    // `version` would duplicate the packageManager pin, `standalone` swaps in a bundled Node,
    // and `run_install` bypasses the setup-node-pnpm install step.
    const offenders = pnpmSetups.filter(setup => setup.step.with !== undefined)
    expect(offenders.map(setup => setup.owner)).toEqual([])
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
    ['npm install --prefix "$dir" pnpm@11.13.1', true],
    ['npm i -g pnpm', true],
    ['pnpm install --frozen-lockfile', false],
    ['npm install --no-save left-pad', false],
  ])('classifies manual activation example %s', (run, expected) => {
    expect(manualActivationPattern.test(run)).toBe(expected)
  })
})
