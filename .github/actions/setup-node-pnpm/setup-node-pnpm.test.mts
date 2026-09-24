import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const source = readFileSync('.github/actions/setup-node-pnpm/action.yml', 'utf8')
type Step = {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
}
const action = load(source) as {
  inputs?: Record<string, { default?: string; required?: boolean }>
  runs?: { steps?: Step[] }
}
const steps = action.runs?.steps ?? []

function step(name: string) {
  const found = steps.find(candidate => candidate.name === name)
  if (!found) throw new Error(`Missing setup-node-pnpm step: ${name}`)
  return found
}

describe('setup-node-pnpm composite action', () => {
  it('exposes only the install-scripts input', () => {
    expect(action.inputs).toEqual({
      'install-scripts': {
        description: 'Set false when dependency lifecycle scripts are intentionally deferred',
        default: 'true',
      },
    })
  })

  it('activates the .nvmrc Node and then pnpm from package.json#packageManager', () => {
    const [node, pnpm] = steps
    expect(node?.uses).toMatch(/^actions\/setup-node@/)
    expect(node?.with).toEqual({ 'node-version-file': '.nvmrc', 'package-manager-cache': false })
    expect(pnpm?.uses).toMatch(/^pnpm\/action-setup@/)
    expect(pnpm?.with).toBeUndefined()
  })

  it('restores the pnpm store cache before installing', () => {
    const names = steps.map(candidate => candidate.name)
    const cache = names.indexOf('Cache pnpm store')
    expect(cache).toBeGreaterThan(-1)
    expect(cache).toBeLessThan(names.indexOf('pnpm install'))
    expect(cache).toBeLessThan(names.indexOf('pnpm install without lifecycle scripts'))
  })

  it('runs exactly one frozen full install per input value', () => {
    // Complementary static conditions: every install-scripts value selects exactly one install,
    // and no-mistakes can model the steps (it cannot model a shell `case` with an `exit 1` arm).
    expect(step('pnpm install')).toEqual({
      name: 'pnpm install',
      if: "inputs.install-scripts != 'false'",
      shell: 'bash',
      run: 'pnpm install --frozen-lockfile',
    })
    expect(step('pnpm install without lifecycle scripts')).toEqual({
      name: 'pnpm install without lifecycle scripts',
      if: "inputs.install-scripts == 'false'",
      shell: 'bash',
      run: 'pnpm install --frozen-lockfile --ignore-scripts',
    })
  })
})
