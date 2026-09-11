import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkConfigInventoryPolicy } from './index.mts'
import type { SharedContext } from 'vouchington-tooling/shared-context'

const ENVIRONMENT_VARIABLES_INDEX = 'docs/overview/infrastructure/environment-variables.md'
const CANONICAL_ENVIRONMENT_VARIABLES_REFERENCE =
  'docs/overview/infrastructure/reference-environment-variables-test.md'
const UNRELATED_ENVIRONMENT_VARIABLES_REFERENCE =
  'docs/overview/infrastructure/reference-unrelated-environment-variable.md'

describe('typed env contract docs drift', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('requires typed contract env vars to appear in env-var docs', async () => {
    const ctx = await makeRepoFixture({
      [ENVIRONMENT_VARIABLES_INDEX]: './dev/config-inventory\n',
      'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
      'docs/development/local-env-vars.md': './dev/config-inventory\n',
      'dev/README.md': '[Command Catalog](reference-command-catalog.md)\n',
      'dev/reference-command-catalog.md': './dev/config-inventory\n',
      'static-code-analysis/README.md': './dev/config-inventory\n',
      'ts-shared/env-contract/index.mts': `
        export function collectTypedEnvContractEntries() {
          return [
            { name: 'DOC_DRIFT_ENV', contractKey: 'local-init:local-web:DOC_DRIFT_ENV', sourceOfTruth: 'local-init', sensitivity: 'internal', runtimeSurfaces: ['local-web'] },
          ]
        }
      `,
      'pnpm-workspace.yaml': 'minimumReleaseAge: 2880\n',
    })

    await expect(checkConfigInventoryPolicy(ctx)).resolves.toEqual({
      errors: expect.arrayContaining([
        'typed env var DOC_DRIFT_ENV from local-init:local-web:DOC_DRIFT_ENV is missing from a canonical docs/overview/infrastructure/reference-environment-variables-*.md leaf',
        'typed local env var DOC_DRIFT_ENV from local-init:local-web:DOC_DRIFT_ENV is missing from docs/development/local-env-vars.md',
      ]),
    })
  })

  it('accepts only canonical environment-variable references as typed env documentation', async () => {
    const files = makeBaseFiles()
    files[CANONICAL_ENVIRONMENT_VARIABLES_REFERENCE] = '`DOC_DRIFT_ENV`\n'
    files['docs/development/local-env-vars.md'] = '`DOC_DRIFT_ENV`\n./dev/config-inventory\n'

    const errors = (await checkConfigInventoryPolicy(await makeRepoFixture(files))).errors

    expect(errors).not.toContain(
      'typed env var DOC_DRIFT_ENV from local-init:local-web:DOC_DRIFT_ENV is missing from a canonical docs/overview/infrastructure/reference-environment-variables-*.md leaf',
    )
  })

  it('does not let the compact index or unrelated docs satisfy typed env documentation', async () => {
    const files = makeBaseFiles()
    files[ENVIRONMENT_VARIABLES_INDEX] = '`DOC_DRIFT_ENV`\n./dev/config-inventory\n'
    files[UNRELATED_ENVIRONMENT_VARIABLES_REFERENCE] = '`DOC_DRIFT_ENV`\n'
    files['docs/development/local-env-vars.md'] = '`DOC_DRIFT_ENV`\n./dev/config-inventory\n'

    await expect(checkConfigInventoryPolicy(await makeRepoFixture(files))).resolves.toEqual({
      errors: expect.arrayContaining([
        'typed env var DOC_DRIFT_ENV from local-init:local-web:DOC_DRIFT_ENV is missing from a canonical docs/overview/infrastructure/reference-environment-variables-*.md leaf',
      ]),
    })
  })

  it('reports typed contract import failures as policy errors', async () => {
    const ctx = await makeRepoFixture({
      [ENVIRONMENT_VARIABLES_INDEX]: './dev/config-inventory\n',
      'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
      'docs/development/local-env-vars.md': './dev/config-inventory\n',
      'dev/README.md': '[Command Catalog](reference-command-catalog.md)\n',
      'dev/reference-command-catalog.md': './dev/config-inventory\n',
      'static-code-analysis/README.md': './dev/config-inventory\n',
      'ts-shared/env-contract/index.mts': 'throw new Error("broken contract")\n',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 2880\n',
    })

    await expect(checkConfigInventoryPolicy(ctx)).resolves.toEqual({
      errors: [expect.stringContaining('failed to load typed env contract')],
    })
  })

  function makeBaseFiles(): Record<string, string> {
    return {
      [ENVIRONMENT_VARIABLES_INDEX]: './dev/config-inventory\n',
      'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
      'docs/development/local-env-vars.md': './dev/config-inventory\n',
      'dev/README.md': '[Command Catalog](reference-command-catalog.md)\n',
      'dev/reference-command-catalog.md': './dev/config-inventory\n',
      'static-code-analysis/README.md': './dev/config-inventory\n',
      'ts-shared/env-contract/index.mts': `
        export function collectTypedEnvContractEntries() {
          return [
            { name: 'DOC_DRIFT_ENV', contractKey: 'local-init:local-web:DOC_DRIFT_ENV', sourceOfTruth: 'local-init', sensitivity: 'internal', runtimeSurfaces: ['local-web'] },
          ]
        }
      `,
      'pnpm-workspace.yaml': 'minimumReleaseAge: 2880\n',
    }
  }

  async function makeRepoFixture(files: Record<string, string>): Promise<SharedContext> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-config-doc-drift-'))
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
