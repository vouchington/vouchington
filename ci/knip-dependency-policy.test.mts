import { describe, expect, it } from 'vitest'

import { ignoredDependencyImportPattern } from './knip-dependency-policy.mts'

describe('Knip dependency policy predicates', () => {
  it('recognizes every import carrier for a documented out-of-graph edge', () => {
    const pattern = ignoredDependencyImportPattern('@services/classifier-runs')
    for (const source of [
      "import { run } from '@services/classifier-runs'",
      "import('@services/classifier-runs/subpath')",
      "require('@services/classifier-runs')",
      "import '@services/classifier-runs'",
    ]) {
      expect(pattern.test(source)).toBe(true)
    }
    expect(pattern.test("import '@services/classifier-runs-other'")).toBe(false)
  })

  it('escapes dotted package names and stops at the package boundary', () => {
    const pattern = ignoredDependencyImportPattern('@org/pkg.name')

    expect(pattern.test("import '@org/pkg.name'")).toBe(true)
    expect(pattern.test("import('@org/pkg.name/subpath')")).toBe(true)
    expect(pattern.test("import '@org/pkgXname'")).toBe(false)
    expect(pattern.test("import '@org/pkg.name-other'")).toBe(false)
  })
})
