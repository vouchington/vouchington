import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface WorkspaceBoundaryRule {
  name: string
  severity: string
  from: { path: string; pathNot: string }
  to: {
    pathNot: string
    dependencyTypes: string[]
    dependencyTypesNot: string[]
  }
}

// This file's forbidden rules are generated at require-time by walking backend/package.json's
// `workspaces` field via `fs.readdirSync` (see ../workspace-package-relative-import-boundaries.cjs).
// Unlike every other .cjs rule file in this directory, which is a static object literal,
// `dep-cruise:backend` running clean against real repo code can't distinguish "the rule works
// and finds nothing to flag" from "discovery silently returned an empty array and the rule never
// ran at all". These tests exercise the real generated output directly -- not a hand-duplicated
// copy of its regex predicates -- so a discovery regression fails loudly here instead of leaving
// CI silently green.
const rules =
  require('../workspace-package-relative-import-boundaries.cjs') as WorkspaceBoundaryRule[]

describe('workspace-package-relative-import-boundaries', () => {
  it('discovers at least one workspace package and generates one uniquely named rule per package', () => {
    expect(rules.length).toBeGreaterThan(0)
    expect(new Set(rules.map(rule => rule.name)).size).toBe(rules.length)
  })

  it('never generates a rule for the backend hub itself', () => {
    expect(rules.some(rule => rule.name === 'workspace-package-boundary-backend')).toBe(false)
  })

  describe('a generated package-boundary rule', () => {
    const packageRoot = 'backend/agents/_shared'
    const rule = rules.find(
      rule => rule.name === 'workspace-package-boundary-backend-agents-_shared',
    )
    if (!rule) throw new Error(`missing generated rule for ${packageRoot}`)

    it('flags a relative import that escapes the package root', () => {
      expect(new RegExp(rule.from.path).test(`${packageRoot}/index.mts`)).toBe(true)
      expect(new RegExp(rule.to.pathNot).test('some-other-workspace-package/index.mts')).toBe(false)
    })

    it('does not flag an import that stays within the package root', () => {
      expect(new RegExp(rule.to.pathNot).test(`${packageRoot}/nested/sibling.mts`)).toBe(true)
    })

    it('exempts test files and declaration files from the from-side restriction', () => {
      expect(new RegExp(rule.from.pathNot).test(`${packageRoot}/index.test.mts`)).toBe(true)
      expect(new RegExp(rule.from.pathNot).test(`${packageRoot}/__tests__/index.mts`)).toBe(true)
      expect(new RegExp(rule.from.pathNot).test(`${packageRoot}/index.d.mts`)).toBe(true)
    })

    it('exempts the non-runtime backend test-helper workspace', () => {
      expect(new RegExp(rule.from.pathNot).test('backend/test-helpers/services/example.mts')).toBe(
        true,
      )
      expect(new RegExp(rule.from.pathNot).test('backend/services/example/index.mts')).toBe(false)
    })

    it('restricts only local, non-type-only dependencies', () => {
      expect(rule.to.dependencyTypes).toEqual(['local'])
      expect(rule.to.dependencyTypesNot).toEqual(['type-only'])
    })
  })
})
