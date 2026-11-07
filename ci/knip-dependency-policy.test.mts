import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { checkKnipDependencyPolicy } from './check-knip-dependency-policy.mts'

import {
  allowedWorkspaceIgnoreDependencies,
  ignoredDependencyImportPattern,
} from './knip-dependency-policy.mts'

describe('Knip extracted workflow evidence', () => {
  it.each(['tracked', 'missing', 'untracked'] as const)(
    'requires a readable tracked helper for %s evidence',
    async state => {
      const root = await mkdtemp(join(tmpdir(), 'knip-workflow-evidence-'))
      onTestFinished(() => rm(root, { recursive: true, force: true }))
      const files = new Map<string, string>()
      const workspaces: Record<string, { ignoreDependencies: string[] }> = {}
      for (const [workspace, allowed] of allowedWorkspaceIgnoreDependencies) {
        workspaces[workspace] = { ignoreDependencies: allowed.map(item => item.dependency) }
        for (const { dependency, evidenceFiles } of allowed) {
          const evidence =
            dependency === 'cloudflare'
              ? "import {} from 'cloudflare:workers'"
              : dependency === '@fontsource/inter'
                ? 'nodeRequire.resolve(`@fontsource/inter/fixture.woff`)'
                : dependency === '@types/react'
                  ? "const name = '@types/react'"
                  : `import {} from '${dependency}'`
          for (const file of evidenceFiles) files.set(file, `${files.get(file) ?? ''}${evidence}\n`)
        }
      }
      const helper = '.github/workflows/coverage.sh'
      files.set('knip.jsonc', JSON.stringify({ workspaces }))
      for (const workflow of ['explain-analyze', 'tests-backend-unit', 'tests-postgres-schema']) {
        files.set(
          `.github/workflows/${workflow}.yml`,
          'jobs:\n  tests:\n    steps:\n      - run: source "$GITHUB_WORKSPACE/.github/workflows/coverage.sh"\n',
        )
      }
      files.set(
        helper,
        './ci/node_modules/.bin/coverage-check merge\npnpm exec coverage-check native-v8-to-lcov\n',
      )
      for (const [file, source] of files) {
        await mkdir(dirname(join(root, file)), { recursive: true })
        await writeFile(join(root, file), source)
      }
      execFileSync('git', ['init', '--quiet'], { cwd: root })
      execFileSync(
        'git',
        [
          'add',
          '--',
          ...[...files.keys()].filter(file => state !== 'untracked' || file !== helper),
        ],
        {
          cwd: root,
        },
      )
      if (state === 'missing') await unlink(join(root, helper))

      let errorMessage: string | null = null
      try {
        checkKnipDependencyPolicy(root)
      } catch (err) {
        if (!(err instanceof Error)) throw err
        errorMessage = err.message
      }
      const expectedError =
        state === 'tracked'
          ? null
          : state === 'missing'
            ? `Knip evidence script is missing: ${helper}`
            : `Knip evidence script must be tracked: ${helper}`
      expect(errorMessage).toBe(expectedError)
    },
  )
})

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
