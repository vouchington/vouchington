import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkConfigInventoryPolicy } from './index.mts'
import type { SharedContext } from 'vouchington-tooling/shared-context'

describe('workflow env policy', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('reports workflow env declarations that have no code or external consumer', async () => {
    const ctx = await makeRepoFixture({
      '.github/workflows/ci.yml': [
        'name: CI',
        'jobs:',
        '  test:',
        '    steps:',
        '      - env:',
        '          STALE_WORKFLOW_ENV: value',
        '          CODE_ENV: value',
        '          DOCKER_BUILD_SUMMARY: "false"',
        '          HARNESS_CANCEL_CONFIRMATION: cancel-active-filaments-sessions',
        '          GH_RETRY_BACKOFF_SECONDS: "1"',
        '          KEEP_MIN: "10"',
        '          GIT_CONFIG_COUNT: "1"',
        '          GIT_CONFIG_KEY_0: core.hooksPath',
        '          GIT_CONFIG_VALUE_0: /dev/null',
        '          PORT: "3000"',
        '          PROTECTED_TAG_CONTAINS: buildcache',
        '          PROTECTED_TAG_PREFIX: latest',
        '          PORT_NUMBER: "3001"',
        '          USED_BY_SHELL: value',
        '          POSTGRES_DB: postgres',
        '          VITEST_REPORT_EXPECTATIONS: context',
        '        run: echo "$USED_BY_SHELL $PORT_NUMBER"',
      ].join('\n'),
      '.github/workflows/ci-ready-dedupe.yml': [
        'jobs:',
        '  ready-dedupe:',
        '    steps:',
        '      - env:',
        '          EVENT_ACTION: ready_for_review',
        '          HEAD_SHA: head-sha',
        '          TESTED_SHA: tested-sha',
      ].join('\n'),
      '.github/workflows/other.yml': [
        'jobs:',
        '  unrelated:',
        '    steps:',
        '      - env:',
        '          EVENT_ACTION: opened',
        '          HEAD_SHA: other-head',
        '          TESTED_SHA: other-tested',
      ].join('\n'),
      'backend/service.mts': 'process.env.CODE_ENV\n',
      'docs/overview/infrastructure/environment-variables.md': './dev/config-inventory\n',
      'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
      'docs/development/local-env-vars.md': './dev/config-inventory\n',
      'dev/README.md': '[Command Catalog](reference-command-catalog.md)\n',
      'dev/reference-command-catalog.md': './dev/config-inventory\n',
      'static-code-analysis/README.md': './dev/config-inventory\n',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 2880\n',
    })

    const errors = (await checkConfigInventoryPolicy(ctx)).errors

    expect(errors).toContain(
      'workflow env STALE_WORKFLOW_ENV in .github/workflows/ci.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason',
    )
    expect(errors).toContain(
      'workflow env PORT in .github/workflows/ci.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason',
    )
    expect(errors).toContain(
      'workflow env HARNESS_CANCEL_CONFIRMATION in .github/workflows/ci.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason',
    )
    for (const name of [
      'GH_RETRY_BACKOFF_SECONDS',
      'KEEP_MIN',
      'PROTECTED_TAG_CONTAINS',
      'PROTECTED_TAG_PREFIX',
    ]) {
      expect(errors).toContain(
        `workflow env ${name} in .github/workflows/ci.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason`,
      )
    }
    for (const name of ['EVENT_ACTION', 'HEAD_SHA', 'TESTED_SHA']) {
      expect(errors).not.toContain(
        `workflow env ${name} in .github/workflows/ci-ready-dedupe.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason`,
      )
      expect(errors).toContain(
        `workflow env ${name} in .github/workflows/other.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason`,
      )
    }
    for (const name of [
      'CODE_ENV',
      'DOCKER_BUILD_SUMMARY',
      'GIT_CONFIG_COUNT',
      'GIT_CONFIG_KEY_0',
      'GIT_CONFIG_VALUE_0',
      'PORT_NUMBER',
      'USED_BY_SHELL',
      'POSTGRES_DB',
      'VITEST_REPORT_EXPECTATIONS',
    ]) {
      expect(errors).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining(`workflow env ${name} in .github/workflows/ci.yml`),
        ]),
      )
    }
  })

  async function makeRepoFixture(files: Record<string, string>): Promise<SharedContext> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-workflow-env-policy-'))
    testDirs.push(dir)
    const trackedFiles = Object.keys(files)
    for (const [file, content] of Object.entries(files)) {
      await mkdir(join(dir, file, '..'), { recursive: true })
      await writeFile(join(dir, file), content)
    }
    return {
      repoRoot: dir,
      isInsideGitRepo: true,
      trackedFiles,
      trackedFileSet: new Set(trackedFiles),
    }
  }
})
