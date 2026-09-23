import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import type { SccComplexityScope } from 'vouchington-tooling/scc-complexity'
import {
  checkSccComplexity,
  VOUCHINGTON_SCC_SCOPES,
  SCC_COMPLEXITY_ARGS,
  TOOLING_SCC_BASELINE,
} from '../scc-complexity/index.mts'

const EMPTY_BASELINE = { version: 1, entries: [] } as const

describe('scc-complexity', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeFixture(trackedFiles: string[]): Promise<SharedContext> {
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-scc-complexity-'))
    testDirs.push(repoRoot)

    await Promise.all(
      ['.github', 'ci', 'dev', 'static-code-analysis'].map(path =>
        mkdir(join(repoRoot, path), { recursive: true }),
      ),
    )

    for (const file of trackedFiles) {
      await mkdir(dirname(join(repoRoot, file)), { recursive: true })
      await writeFile(join(repoRoot, file), 'export const value = true\n')
    }

    return {
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles,
      trackedFileSet: new Set(trackedFiles),
    }
  }

  it('encodes product and tooling scopes', () => {
    expect(SCC_COMPLEXITY_ARGS).toContain(
      '.git,fixtures,__tests__,test-helpers,static-code-analysis,ci,.github,dev',
    )
    expect(VOUCHINGTON_SCC_SCOPES).toEqual([
      expect.objectContaining({ includePaths: ['.'], name: 'product' }),
      { includePaths: ['.github', 'ci', 'dev', 'static-code-analysis'], name: 'tooling' },
    ])
  })

  it('reports product scanner violations', async () => {
    const ctx = await makeFixture(['backend/too-complex.mts'])
    const report = JSON.stringify([
      { Files: [{ Location: 'backend/too-complex.mts', Complexity: 72 }] },
    ])

    await expect(
      checkSccComplexity(ctx, reportForScope('product', report), { baseline: EMPTY_BASELINE }),
    ).resolves.toEqual({ errors: [expect.stringContaining('backend/too-complex.mts')] })
  })

  it('holds tooling files to the checked-in baseline unless a baseline is passed', async () => {
    const { entries } = TOOLING_SCC_BASELINE
    const ctx = await makeFixture(entries.map(entry => entry.file))
    const files = entries.map(entry => ({ Location: entry.file, Complexity: entry.complexity }))
    const runScc = reportForScope('tooling', JSON.stringify([{ Files: files }]))

    await expect(checkSccComplexity(ctx, runScc)).resolves.toEqual({ errors: [] })
    const unbaselined = await checkSccComplexity(ctx, runScc, { baseline: EMPTY_BASELINE })
    expect(unbaselined.errors).not.toEqual([])
  })

  it('runs the configured scc command', async () => {
    const ctx = await makeFixture(['backend/file.mts'])
    const binDir = await mkdtemp(join(tmpdir(), 'voucha-fake-scc-'))
    testDirs.push(binDir)
    const marker = join(binDir, 'ran')
    const executable = join(binDir, 'scc')
    await writeFile(executable, `#!/bin/sh\ntouch '${marker}'\nexit 9\n`)
    await chmod(executable, 0o755)

    const report = await checkSccComplexity(ctx, undefined, {
      baseline: EMPTY_BASELINE,
      command: executable,
    })

    expect(existsSync(marker)).toBe(true)
    expect(report.errors).not.toEqual([])
  })
})

function reportForScope(scopeName: string, report: string) {
  return (_outputPath: string, scope?: SccComplexityScope) =>
    Promise.resolve(scope?.name === scopeName ? report : '[{"Files":[]}]')
}
