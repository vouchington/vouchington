import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface InlinedRule {
  name: string
  severity: string
  to: {
    circular?: boolean
    couldNotResolve?: boolean
    dependencyTypes?: string[]
  }
}

interface DependencyCruiserConfig {
  extends?: readonly string[]
  forbidden: InlinedRule[]
}

const config = require('../../.dependency-cruiser.cjs') as DependencyCruiserConfig

describe('backend/.dependency-cruiser.cjs inlined base rules', () => {
  it('does not extend the bare dependency-cruiser presets', () => {
    const extended = config.extends ?? []
    expect(extended).not.toContain('dependency-cruiser/configs/rules/no-circular')
    expect(extended).not.toContain('dependency-cruiser/configs/rules/not-to-unresolvable')
    expect(extended).not.toContain('dependency-cruiser/configs/rules/no-non-package-json')
  })

  it('forbids cycles, unresolvable imports, and undeclared packages', () => {
    expect(config.forbidden.find(entry => entry.name === 'no-circular')).toMatchObject({
      severity: 'error',
      to: { circular: true },
    })
    expect(config.forbidden.find(entry => entry.name === 'not-to-unresolvable')).toMatchObject({
      severity: 'error',
      to: { couldNotResolve: true },
    })
    expect(config.forbidden.find(entry => entry.name === 'no-non-package-json')).toMatchObject({
      severity: 'error',
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    })
  })
})
