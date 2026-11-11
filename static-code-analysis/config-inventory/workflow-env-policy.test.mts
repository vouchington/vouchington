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
        '          UNREFERENCED_FIXTURE_ENV: cancel-active-filaments-sessions',
        '          GH_RETRY_BACKOFF_SECONDS: "1"',
        '          KEEP_MIN: "10"',
        '          GIT_CONFIG_COUNT: "1"',
        '          GIT_CONFIG_KEY_0: core.hooksPath',
        '          GIT_CONFIG_VALUE_0: /dev/null',
        '          GHCR_KEEP_MAIN: "30"',
        '          GHCR_OWNER: vouchington',
        '          GHCR_OWNER_TYPE: org',
        '          GHCR_PACKAGES: api',
        '          GHCR_UNMERGED_MIN_AGE_DAYS: "7"',
        '          GHCR_KEEP_STALE: "30"',
        '          PORT: "3000"',
        '          PROTECTED_TAG_CONTAINS: buildcache',
        '          PROTECTED_TAG_PREFIX: latest',
        '          PORT_NUMBER: "3001"',
        '          USED_BY_SHELL: value',
        '          POSTGRES_DB: postgres',
        '          VITEST_REPORT_EXPECTATIONS: context',
        '          VITEST_FILE_PROGRESS_FILE: progress.log',
        '          VITEST_JUNIT_OUTPUT_FILE: report.xml',
        '          STORYBOOK_BROWSER_COVERAGE: 0',
        '          STORYBOOK_BROWSER_COVERAGE_CUSTOM: stale',
        '          VITEST_FILE_PROGRESS_FILE_CUSTOM: stale',
        '          VITEST_JUNIT_OUTPUT_FILE_CUSTOM: stale',
        '          NODE_DISABLE_COMPILE_CACHE: "1"',
        '          NODE_DISABLE_COMPILE_CACHE_CUSTOM: stale',
        '        run: echo "$USED_BY_SHELL $PORT_NUMBER"',
      ].join('\n'),
      'backend/service.mts': 'process.env.CODE_ENV\n',
      'docs/overview/infrastructure/environment-variables.md': './dev/config-inventory\n',
      'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
      'docs/development/local-env-vars.md': './dev/config-inventory\n',
      'docs/development/quality/static-code-analysis/README.md': './dev/config-inventory\n',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 2880\n',
    })

    const errors = (await checkConfigInventoryPolicy(ctx)).errors

    expect(errors).toContain(
      'workflow env STALE_WORKFLOW_ENV in .github/workflows/ci.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason',
    )
    expect(errors).toContain(
      'workflow env UNREFERENCED_FIXTURE_ENV in .github/workflows/ci.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason',
    )
    for (const name of [
      'GH_RETRY_BACKOFF_SECONDS',
      'KEEP_MIN',
      'PROTECTED_TAG_CONTAINS',
      'PROTECTED_TAG_PREFIX',
      'NODE_DISABLE_COMPILE_CACHE_CUSTOM',
      'GHCR_KEEP_STALE',
      'VITEST_FILE_PROGRESS_FILE_CUSTOM',
      'VITEST_JUNIT_OUTPUT_FILE_CUSTOM',
      'STORYBOOK_BROWSER_COVERAGE_CUSTOM',
    ]) {
      expect(errors).toContain(
        `workflow env ${name} in .github/workflows/ci.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason`,
      )
    }
    for (const name of [
      'CODE_ENV',
      'PORT',
      'DOCKER_BUILD_SUMMARY',
      'GIT_CONFIG_COUNT',
      'GIT_CONFIG_KEY_0',
      'GIT_CONFIG_VALUE_0',
      'PORT_NUMBER',
      'USED_BY_SHELL',
      'POSTGRES_DB',
      'VITEST_REPORT_EXPECTATIONS',
      'VITEST_FILE_PROGRESS_FILE',
      'VITEST_JUNIT_OUTPUT_FILE',
      'STORYBOOK_BROWSER_COVERAGE',
      'NODE_DISABLE_COMPILE_CACHE',
      'GHCR_KEEP_MAIN',
      'GHCR_OWNER',
      'GHCR_OWNER_TYPE',
      'GHCR_PACKAGES',
      'GHCR_UNMERGED_MIN_AGE_DAYS',
    ]) {
      expect(errors).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining(`workflow env ${name} in .github/workflows/ci.yml`),
        ]),
      )
    }
  })

  it('retains extracted workflow and composite shell readers without accepting unrelated files', async () => {
    const ctx = await makeRepoFixture({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  test:',
        '    steps:',
        '      - env:',
        '          EXTRACTED_WORKFLOW_ENV: value',
        '          EXTRACTED_ACTION_ENV: value',
        '          STALE_SCRIPT_ENV: value',
        '          LOOKALIKE_SCRIPT_ENV: value',
        '        run: source .github/workflows/ci/run.sh',
      ].join('\n'),
      '.github/workflows/ci/run.sh': 'echo "$EXTRACTED_WORKFLOW_ENV"\n',
      '.github/actions/example/run.sh': 'echo "$EXTRACTED_ACTION_ENV"\n',
      '.github/workflows/ci/ignored.txt': 'echo "$LOOKALIKE_SCRIPT_ENV"\n',
    })

    const errors = (await checkConfigInventoryPolicy(ctx)).errors
    for (const name of ['EXTRACTED_WORKFLOW_ENV', 'EXTRACTED_ACTION_ENV']) {
      expect(errors).not.toEqual(
        expect.arrayContaining([expect.stringContaining(`workflow env ${name} `)]),
      )
    }
    for (const name of ['STALE_SCRIPT_ENV', 'LOOKALIKE_SCRIPT_ENV']) {
      expect(errors).toContain(
        `workflow env ${name} in .github/workflows/ci.yml is not referenced by repo code; remove it or add an explicit config-inventory allowlist reason`,
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
