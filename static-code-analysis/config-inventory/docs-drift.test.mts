import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkConfigInventoryPolicy } from './index.mts'
import type { SharedContext } from 'vouchington-tooling/shared-context'

const ENVIRONMENT_VARIABLES_INDEX = 'docs/overview/infrastructure/environment-variables.md'

describe('typed env contract docs drift', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('requires typed local env vars to appear in the local env-var docs', async () => {
    const ctx = await makeRepoFixture({
      [ENVIRONMENT_VARIABLES_INDEX]: './dev/config-inventory\n',
      'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
      'docs/development/local-env-vars.md': './dev/config-inventory\n',
      'docs/development/quality/static-code-analysis/README.md': './dev/config-inventory\n',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 2880\n',
    })

    await expect(checkConfigInventoryPolicy(ctx)).resolves.toEqual({
      errors: expect.arrayContaining([
        'typed local env var CF_WORKER_SECRET from local-init:local-worktree:CF_WORKER_SECRET is missing from docs/development/local-env-vars.md',
      ]),
    })
  })

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
