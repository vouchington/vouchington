import { existsSync } from 'node:fs'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import {
  checkSccComplexity,
  SCC_COMPLEXITY_ARGS,
  SCC_COMPLEXITY_LIMIT,
} from '../scc-complexity/index.mts'

describe('scc-complexity', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  function context(trackedFiles: string[]): SharedContext {
    return {
      isInsideGitRepo: true,
      repoRoot: '/repo',
      trackedFiles,
      trackedFileSet: new Set(trackedFiles),
    }
  }

  it('asks scc for per-file complexity and skips tests, fixtures, and test helpers', () => {
    expect(SCC_COMPLEXITY_LIMIT).toBe(50)
    expect(SCC_COMPLEXITY_ARGS).toEqual(
      expect.arrayContaining([
        '--format',
        'json',
        '--by-file',
        '--exclude-dir',
        '.git,fixtures,__tests__,test-helpers',
        '--not-match',
        String.raw`\.(test|spec)\.`,
      ]),
    )
  })

  it('reports a tracked file over the ceiling', async () => {
    const report = JSON.stringify([
      { Files: [{ Location: 'backend/too-complex.mts', Complexity: 51 }] },
    ])

    await expect(
      checkSccComplexity(context(['backend/too-complex.mts']), async () => report),
    ).resolves.toEqual({
      errors: [expect.stringContaining('backend/too-complex.mts')],
    })
  })

  it('accepts a tracked file at the ceiling and ignores untracked files', async () => {
    const report = JSON.stringify([
      {
        Files: [
          { Location: 'backend/at-limit.mts', Complexity: 50 },
          { Location: 'backend/untracked.mts', Complexity: 90 },
        ],
      },
    ])

    await expect(
      checkSccComplexity(context(['backend/at-limit.mts']), async () => report),
    ).resolves.toEqual({ errors: [] })
  })

  it('fails when the scc command is missing or exits non-zero', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'voucha-fake-scc-'))
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-scc-repo-'))
    testDirs.push(binDir, repoRoot)
    const marker = join(binDir, 'ran')
    const executable = join(binDir, 'scc')
    await writeFile(executable, `#!/bin/sh\ntouch '${marker}'\nexit 9\n`)
    await chmod(executable, 0o755)
    const repo = {
      ...context(['backend/file.mts']),
      repoRoot,
    }

    const report = await checkSccComplexity(repo, undefined, {
      command: executable,
    })

    expect(existsSync(marker)).toBe(true)
    expect(report.errors.join('\n')).toContain('scc-complexity failed')

    const missing = await checkSccComplexity(repo, undefined, {
      command: join(binDir, 'missing-scc'),
    })
    expect(missing.errors.join('\n')).toContain('scc executable not found')
  })
})
